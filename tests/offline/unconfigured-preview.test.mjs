import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule } from '../support/source-harness.mjs';

class ResponseDouble {
  constructor(body, options = {}) { this.body = body; this.status = options.status ?? 200; }
  static next() { return new ResponseDouble('next'); }
  static redirect(url) { return new ResponseDouble(url.toString(), { status: 307 }); }
}
const request = (path, method = 'GET') => ({ url: `http://localhost:3000${path}`, nextUrl: { pathname: path }, method, cookies: { getAll: () => [] } });

test('unconfigured preview permits only its public GET routes and fails closed elsewhere', async () => {
  let clients = 0;
  const { proxy } = loadSourceModule('proxy.ts', {
    'next/server': { NextResponse: ResponseDouble },
    '@supabase/ssr': { createServerClient() { clients++; throw new Error('Unexpected backend call'); } },
  }, { process: { env: {} }, URL });
  for (const path of ['/', '/games', '/arena', '/demo', '/lab-rush.html', '/offline.html', '/question-import', '/classroom-staging']) {
    assert.equal((await proxy(request(path))).status, 200, path);
  }
  const solo = await proxy(request('/tycoon'));
  assert.equal(solo.status, 307);
  assert.equal(solo.body, 'http://localhost:3000/demo');
  assert.equal((await proxy(request('/join'))).status, 503);
  assert.equal((await proxy(request('/arena/private'))).status, 503);
  assert.equal((await proxy(request('/classroom-staging/private'))).status, 503);
  assert.equal((await proxy(request('/classroom-staging', 'POST'))).status, 503);
  assert.equal((await proxy(request('/arena', 'POST'))).status, 503);
  assert.equal((await proxy(request('/', 'POST'))).status, 503);
  assert.equal(clients, 0);
});

test('configured requests still refresh the server session', async () => {
  let checked = 0;
  const { proxy } = loadSourceModule('proxy.ts', {
    'next/server': { NextResponse: ResponseDouble },
    '@supabase/ssr': { createServerClient() { return { auth: { async getUser() { checked++; } } }; } },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-test-key' } } });
  assert.equal((await proxy(request('/join'))).status, 200);
  assert.equal(checked, 1);
  for (const path of ['/arena', '/demo', '/lab-rush.html', '/offline.html', '/question-import', '/classroom-staging']) {
    assert.equal((await proxy(request(path))).status, 200);
  }
  assert.equal(checked, 1, 'public solo samples never need an account service');
});
