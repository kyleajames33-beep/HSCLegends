/** Disposable local Supabase only. Creates an anonymous auth user; local stack teardown removes it. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { createStagingGuestAuth } from '../../lib/classroom-v2/guest-auth.ts';
import { validateLocalOptions, validateContainer, validateGatewayPort, validateFetchTarget, DB_CONTAINER, API_CONTAINER } from '../../prototypes/classroom-v2/test/local-api-safety.mjs';

const {url:projectUrl,key:clientKey} = validateLocalOptions({HSC_LAB_ALLOW_DISPOSABLE:process.env.HSC_LAB_ALLOW_DISPOSABLE,HSC_LAB_LOCAL_URL:process.env.HSC_LOCAL_SUPABASE_URL,HSC_LAB_ANON_KEY:process.env.HSC_LOCAL_SUPABASE_PUBLISHABLE_KEY});
const dockerEnv={...process.env};
for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','HSC_LOCAL_SUPABASE_PUBLISHABLE_KEY']) delete dockerEnv[name];
const inspect=name=>JSON.parse(execFileSync('docker',['--host=unix:///var/run/docker.sock','inspect',name],{env:dockerEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];
const db=inspect(DB_CONTAINER), gateway=inspect(API_CONTAINER);
validateContainer(db,DB_CONTAINER,'public.ecr.aws/supabase/postgres:');
validateContainer(gateway,API_CONTAINER,'public.ecr.aws/supabase/kong:');
validateGatewayPort(gateway,projectUrl);
const localFetch=(input,init)=>{validateFetchTarget(input,projectUrl);return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});};
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
const config = { auth: { storage, storageKey: 'hsc-local-guest-auth-smoke', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }, global:{fetch:localFetch} };
const makeClient = () => createClient(projectUrl, clientKey, config);
const options = { enabled: true, target: 'staging', projectUrl };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(controller, expected) {
  const limit = Date.now() + 10000;
  while (Date.now() < limit) {
    const snapshot = controller.getSnapshot();
    if (snapshot.status === expected) return snapshot;
    if (snapshot.status === 'unavailable') throw new Error('Local authentication unavailable; check anonymous sign-ins are enabled');
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${expected}`);
}
const firstClient = makeClient();
const first = createStagingGuestAuth(options, firstClient.auth);
let secondClient, second;
try {
  first.start(); await waitFor(first, 'signed-out');
  assert.equal(await first.signIn(), 'requested');
  const created = await waitFor(first, 'ready');
  assert.equal(created.isAnonymous, true);
  const verified = await firstClient.auth.getUser();
  assert.equal(verified.error, null); assert.equal(verified.data.user.id, created.actorId);
  first.dispose(); firstClient.auth.stopAutoRefresh();
  secondClient = makeClient(); second = createStagingGuestAuth(options, secondClient.auth);
  second.start(); const recovered = await waitFor(second, 'ready');
  assert.equal(recovered.actorId, created.actorId); assert.equal(recovered.isAnonymous, true);
  const signedOut = await secondClient.auth.signOut(); assert.equal(signedOut.error, null);
  await waitFor(second, 'signed-out');
  console.log('Local guest auth passed: verified anonymous issuance, persisted-session recovery, and sign-out.');
} finally {
  first.dispose(); firstClient.auth.stopAutoRefresh();
  second?.dispose(); secondClient?.auth.stopAutoRefresh();
}
