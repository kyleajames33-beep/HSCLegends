import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import http, { request as namedHttpRequest } from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
const root = fileURLToPath(new URL('../../', import.meta.url));
const guard = fileURLToPath(new URL('../support/deny-network.mjs', import.meta.url));
const scripts = readdirSync(new URL('../../scripts/', import.meta.url)).filter((name) => /^test-.*\.mjs$/.test(name));
for (const script of scripts) {
  for (const target of [undefined, 'https://rerfrskojieacxthfavb.supabase.co', 'http://127.0.0.1:54321']) {
    test(`${script} refuses ${target ?? 'missing target'} before I/O`, () => {
      const env = { PATH: process.env.PATH ?? '', HSC_LEGENDS_ALLOW_LIVE_TESTS: '1' };
      if (target) Object.assign(env, { SUPABASE_URL: target, NEXT_PUBLIC_SUPABASE_URL: target, BASE_URL: target, SUPABASE_ANON_KEY: 'SYNTHETIC_NOT_A_CREDENTIAL', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'SYNTHETIC_NOT_A_CREDENTIAL' });
      const result = spawnSync(process.execPath, ['--import', guard, `scripts/${script}`], { cwd: root, env, encoding: 'utf8', timeout: 5000 });
      assert.ifError(result.error); assert.equal(result.status, 1);
      assert.match(result.stderr, /LEGACY_NETWORK_TEST_REFUSED/);
      assert.doesNotMatch(result.stderr, /OFFLINE_TEST_NETWORK_REFUSED|SYNTHETIC_NOT_A_CREDENTIAL/);
      assert.doesNotMatch(result.stdout, /Connected|ALL TESTS PASSED|TESTS PASSED/);
    });
  }
}
const loopback = 'http://127.0.0.1:54321';
const transports = {
  fetch: () => fetch(loopback),
  'http.request': () => http.request(loopback),
  'http.get': () => http.get(loopback),
  'https.request': () => https.request('https://127.0.0.1:54321'),
  'https.get': () => https.get('https://127.0.0.1:54321'),
  'net.connect': () => net.connect({ host: '127.0.0.1', port: 54321 }),
  'net.createConnection': () => net.createConnection({ host: '127.0.0.1', port: 54321 }),
  'Socket.connect': () => new net.Socket().connect({ host: '127.0.0.1', port: 54321 }),
  'tls.connect': () => tls.connect({ host: '127.0.0.1', port: 54321 }),
  WebSocket: () => new WebSocket('ws://127.0.0.1:54321'),
  'named HTTP export': () => namedHttpRequest(loopback),
};
for (const [name, attempt] of Object.entries(transports)) {
  test(`offline preload blocks loopback ${name}`, () => {
    assert.throws(attempt, /OFFLINE_TEST_NETWORK_REFUSED/);
  });
}
