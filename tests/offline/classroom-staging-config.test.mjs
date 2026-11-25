import test from 'node:test';
import assert from 'node:assert/strict';
import { clashConfig, stagingConfig } from '../../lib/classroom-v2/staging-config.ts';
const ref = 'abcdefghijklmnopqrst';
const base = { CLASSROOM_STAGING_ENABLED:'true', CLASSROOM_STAGING_PROJECT_REF:ref, CLASSROOM_STAGING_URL:`https://${ref}.supabase.co`, CLASSROOM_STAGING_PUBLIC_KEY:'sb_publishable_123456789012345', NEXT_PUBLIC_SUPABASE_URL:'https://rerfrskojieacxthfavb.supabase.co' };
const jwt = role => `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
test('staging requires explicit opt-in, separate matching project and public key', () => {
  assert.deepEqual(stagingConfig(base), {url:`https://${ref}.supabase.co`, publicKey:base.CLASSROOM_STAGING_PUBLIC_KEY, projectRef:ref});
  for (const patch of [ { CLASSROOM_STAGING_ENABLED:undefined }, { CLASSROOM_STAGING_ENABLED:'yes' }, { CLASSROOM_STAGING_PROJECT_REF:'rerfrskojieacxthfavb', CLASSROOM_STAGING_URL:'https://rerfrskojieacxthfavb.supabase.co' }, { NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co/` }, { CLASSROOM_STAGING_PROJECT_REF:'abcdefghijklmnopqrsu' }, { CLASSROOM_STAGING_URL:`http://${ref}.supabase.co` }, { CLASSROOM_STAGING_URL:`https://${ref}.supabase.co/path` }, { CLASSROOM_STAGING_URL:`https://user@${ref}.supabase.co` }, { CLASSROOM_STAGING_URL:`https://${ref}.supabase.co.evil.test` }, { CLASSROOM_STAGING_PUBLIC_KEY:'sb_secret_123456789012345' }, { CLASSROOM_STAGING_PUBLIC_KEY:jwt('service_role') } ]) assert.equal(stagingConfig({...base,...patch}),null,JSON.stringify(patch));
  assert.ok(stagingConfig({...base, CLASSROOM_STAGING_PUBLIC_KEY:jwt('anon')}));
  assert.ok(stagingConfig({...base, CLASSROOM_STAGING_PROJECT_REF:'local', CLASSROOM_STAGING_URL:'http://127.0.0.1:54321'}));
  assert.ok(stagingConfig({...base, CLASSROOM_STAGING_PROJECT_REF:'local', CLASSROOM_STAGING_URL:'http://[::1]:54321'}));
  assert.equal(stagingConfig({...base, CLASSROOM_STAGING_PROJECT_REF:'local', CLASSROOM_STAGING_URL:'http://192.168.1.2:54321'}),null);
  assert.equal(stagingConfig({...base, CLASSROOM_STAGING_PROJECT_REF:'local', CLASSROOM_STAGING_URL:'http://127.0.0.1:9999'}),null);
});

test('Reactor Clash opts into a secure relay endpoint or a loopback WebSocket', () => {
  assert.deepEqual(clashConfig(base), stagingConfig(base));
  for (const url of ['wss://relay.example/clash', 'ws://127.0.0.1:3042/clash', 'ws://[::1]:3042/clash']) {
    assert.equal(clashConfig({ ...base, CLASSROOM_STAGING_RELAY_URL: url }).relayUrl, url);
  }
  for (const url of ['ws://relay.example/clash', 'wss://relay.example/another-path', 'wss://name@relay.example/clash', 'wss://relay.example/clash?token=x', '']) {
    assert.equal(clashConfig({ ...base, CLASSROOM_STAGING_RELAY_URL: url }), null);
  }
  assert.equal(clashConfig({ ...base, CLASSROOM_STAGING_ENABLED: 'false', CLASSROOM_STAGING_RELAY_URL: 'wss://relay.example/clash' }), null);
});
