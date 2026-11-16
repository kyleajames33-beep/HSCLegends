import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function worker() {
  const listeners = new Map(), stored = new Map(), deleted = [], fetched = [];
  let offline = false, storageError = false;
  const cache = {
    async addAll(paths) { for (const path of paths) stored.set(path, new Response(path)); },
    async match(path) { return stored.get(path)?.clone(); },
    async put(path, response) { stored.set(path, response); },
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://legends.test' }, addEventListener: (name, fn) => listeners.set(name, fn), skipWaiting() {}, clients: { claim() {} } },
    caches: {
      async open() { if (storageError) throw new Error('Storage blocked'); return cache; },
      async keys() { return ['legends-shell-v2', 'legends-offline-v2', 'legends-offline-v3', 'another-app']; },
      async delete(name) { deleted.push(name); },
    },
    async fetch(request) { fetched.push(request.url); if (offline) throw new Error('Offline'); return new Response('fresh'); },
    URL, Response,
  });
  return {
    stored, deleted, fetched,
    setOffline(value) { offline = value; },
    blockStorage() { storageError = true; },
    async lifecycle(name) { let pending; listeners.get(name)({ waitUntil(value) { pending = value; } }); await pending; },
    navigate(path, method = 'GET', mode = 'navigate') {
      let pending;
      listeners.get('fetch')({ request: { url: `https://legends.test${path}`, method, mode }, respondWith(value) { pending = value; } });
      return pending;
    },
  };
}

test('offline installation caches only self-contained public play and deletes only owned old caches', async () => {
  const w = worker(); await w.lifecycle('install'); await w.lifecycle('activate');
  assert.deepEqual([...w.stored.keys()], ['/offline.html', '/lab-rush.html']);
  assert.deepEqual(w.deleted, ['legends-shell-v2', 'legends-offline-v2']);
});

test('offline play recovers the sample while account and classroom routes receive the public offline page', async () => {
  const w = worker(); await w.lifecycle('install'); w.setOffline(true);
  assert.equal(await (await w.navigate('/demo')).text(), '/lab-rush.html');
  assert.equal(await (await w.navigate('/lab-rush.html')).text(), '/lab-rush.html');
  for (const path of ['/', '/arena', '/profile', '/join', '/host?code=private']) {
    assert.equal(await (await w.navigate(path)).text(), '/offline.html');
  }
});

test('successful account navigations are never cached and mutations are never intercepted', async () => {
  const w = worker(); await w.lifecycle('install');
  assert.equal(await (await w.navigate('/profile')).text(), 'fresh');
  assert.equal(w.stored.has('/profile'), false);
  assert.equal(w.navigate('/api/answer', 'POST'), undefined);
  assert.equal(w.navigate('/assets/private', 'GET', 'cors'), undefined);
  assert.equal(w.fetched.length, 1);
});

test('storage failures preserve online play and yield an explicit offline error', async () => {
  const w = worker(); w.blockStorage();
  assert.equal(await (await w.navigate('/lab-rush.html')).text(), 'fresh');
  w.setOffline(true);
  const response = await w.navigate('/demo');
  assert.equal(response.status, 503); assert.match(await response.text(), /offline/i);
});
