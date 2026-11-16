import test from 'node:test';
import assert from 'node:assert/strict';
import { createStagingGuestAuth, isAllowedGuestAuthTarget } from '../../lib/classroom-v2/guest-auth.ts';

const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const options = { enabled: true, target: 'staging', projectUrl: 'https://dedicated-stage.supabase.co' };
const missing = { data: { user: null }, error: { name: 'AuthSessionMissingError' } };
const user = (id = '00000000-0000-4000-8000-000000000001', is_anonymous = true) => ({ data: { user: { id, is_anonymous } }, error: null });
const flush = () => new Promise(resolve => setTimeout(resolve, 10));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fakeAuth(initial = missing) {
 let callback, calls = 0, signins = 0, unsubscribed = false, current = initial, signin = async () => ({ error: null });
 return { auth: { getUser: () => { calls++; return typeof current === 'function' ? current() : Promise.resolve(current); }, signInAnonymously: value => { signins++; return signin(value); }, onAuthStateChange: cb => { callback = cb; return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } }; } },
   set(value) { current = value; }, onSignIn(fn) { signin = fn; }, emit(event) { callback?.(event); }, counts: () => ({ calls, signins, unsubscribed }) };
}

test('target guard rejects production, unsafe URLs and absent explicit opt-in', () => {
 assert.equal(isAllowedGuestAuthTarget(options), true);
 for (const projectUrl of ['https://rerfrskojieacxthfavb.supabase.co', 'https://rerfrskojieacxthfavb.supabase.co.', 'https://user:pass@example.com', 'https://example.com/path', 'http://example.com', 'not-a-url']) assert.equal(isAllowedGuestAuthTarget({ ...options, projectUrl }), false, projectUrl);
 assert.equal(isAllowedGuestAuthTarget({ ...options, enabled: false }), false);
 assert.equal(isAllowedGuestAuthTarget({ ...options, projectUrl: 'http://localhost:54321' }), true);
 assert.throws(() => createStagingGuestAuth({ ...options, enabled: false }, fakeAuth().auth), /INVALID_STAGING_TARGET/);
});

test('a verified existing session is retained and cannot be replaced with an anonymous login', async () => {
 const fake = fakeAuth(user(id, false)), lifecycle = createStagingGuestAuth(options, fake.auth);
 lifecycle.start(); await flush(); assert.deepEqual(lifecycle.getSnapshot(), { status: 'ready', actorId: id, generation: 1, isAnonymous: false });
 assert.equal(await lifecycle.signIn(), 'unavailable'); assert.equal(fake.counts().signins, 0);
 lifecycle.dispose(); assert.equal(fake.counts().unsubscribed, true); assert.equal(lifecycle.getSnapshot().actorId, null); assert.equal(lifecycle.getSnapshot().generation, 2);
});

test('guest creation is explicit, requires verified missing session, and prevents duplicate attempts', async () => {
 const fake = fakeAuth(), inflight = deferred(), states = [], lifecycle = createStagingGuestAuth(options, fake.auth);
 fake.onSignIn(async value => { assert.deepEqual(value, { options: { captchaToken: 'captcha' } }); return inflight.promise; });
 lifecycle.subscribe(() => states.push(lifecycle.getSnapshot().status)); lifecycle.start(); await flush();
 assert.equal(lifecycle.getSnapshot().status, 'signed-out'); const first = lifecycle.signIn('captcha');
 assert.equal(await lifecycle.signIn('captcha'), 'unavailable'); assert.equal(fake.counts().signins, 1);
 fake.set(user()); fake.emit('SIGNED_IN'); inflight.resolve({ error: null }); assert.equal(await first, 'requested'); await flush();
 assert.equal(lifecycle.getSnapshot().actorId, id); assert.equal(lifecycle.getSnapshot().isAnonymous, true); assert.ok(states.includes('checking')); lifecycle.dispose();
});

test('late initial lookups cannot revive an old actor after sign-out or account switch', async () => {
 const pending = deferred(), fake = fakeAuth(() => pending.promise), lifecycle = createStagingGuestAuth(options, fake.auth);
 lifecycle.start(); await flush(); fake.set(missing); fake.emit('SIGNED_OUT'); await flush();
 assert.equal(lifecycle.getSnapshot().status, 'signed-out'); pending.resolve(user()); await flush(); assert.equal(lifecycle.getSnapshot().status, 'signed-out');
 fake.set(user(other)); fake.emit('SIGNED_IN'); assert.equal(lifecycle.getSnapshot().actorId, null); await flush(); assert.equal(lifecycle.getSnapshot().actorId, other); lifecycle.dispose();
});

test('auth errors are unavailable rather than permission to create an account; retry can recover', async () => {
 const fake = fakeAuth({ data: { user: null }, error: { name: 'AuthRetryableFetchError' } }), lifecycle = createStagingGuestAuth(options, fake.auth);
 lifecycle.start(); await flush(); assert.equal(lifecycle.getSnapshot().status, 'unavailable'); assert.equal(await lifecycle.signIn(), 'unavailable'); assert.equal(fake.counts().signins, 0);
 fake.set(missing); lifecycle.retry(); await flush(); assert.equal(lifecycle.getSnapshot().status, 'signed-out'); lifecycle.dispose();
});

test('disposal prevents a pending lookup or sign-in from exposing an actor', async () => {
 const pending = deferred(), fake = fakeAuth(() => pending.promise), lifecycle = createStagingGuestAuth(options, fake.auth);
 let notifications = 0; lifecycle.subscribe(() => notifications++); lifecycle.start(); await flush(); lifecycle.dispose(); const before = notifications;
 pending.resolve(user()); fake.emit('SIGNED_IN'); await flush(); assert.equal(notifications, before); assert.equal(lifecycle.getSnapshot().actorId, null);
 const next = fakeAuth(), sign = deferred(), second = createStagingGuestAuth(options, next.auth); next.onSignIn(() => sign.promise); second.start(); await flush(); const request = second.signIn(); second.dispose(); sign.resolve({ error: null }); assert.equal(await request, 'obsolete');
});
