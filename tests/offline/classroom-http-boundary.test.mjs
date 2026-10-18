import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomHttpBoundary, CLASSROOM_COOKIE, CLASSROOM_HTTP_PATHS } from '../../lib/classroom-server/http-boundary.mjs';

// Public deterministic test bytes only. No cryptographic issuer, credentials,
// real authentication, HTTP listener or network is used by these tests.
const SECRET = Buffer.alloc(32, 65).toString('base64url');
const OTHER = Buffer.alloc(32, 66).toString('base64url');
const id = number => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const room = id(1), player = id(2), accountId = id(3), otherAccount = id(4);
const origin = 'https://classroom.example.test';
const context = Object.freeze({ source: 'trusted-test-peer', marker: 'server-context' });
const proof = { sessionId: room, playerId: player, secret: SECRET };
const publicReceipt = { questionIndex: 0, acceptedChoice: 0, isCorrect: true, points: 147, answeredAt: 1000,
  correctIndex: 0, contentRevision: 'v1', keyProvenance: 'frozen' };
const publicSnapshot = { schemaVersion: 1, sessionId: room, playerId: player, status: 'active', index: 0,
  total: 1, startedAt: 0, durationMs: 15000, isDouble: false, contentStatus: 'current-session', ownReceipt: null,
  question: { stem: 'Synthetic question', options: ['A', 'B'], contentRevision: 'v1' } };
function fixture(overrides = {}) {
  const calls = []; const state = { principal: null, ownerId: null, expiresAt: 100000, now: 1000, revoked: false, freshJoins: 0 };
  const grant = () => ({ proof: { ...proof }, ownerId: state.ownerId, expiresAt: state.expiresAt });
  const options = {
    origin,
    guestSessions: {
      async join(input, trusted) {
        calls.push(['join', input, trusted]);
        if (trusted.cookieSecret && trusted.cookieSecret !== SECRET) throw Object.assign(new Error('bad secret'), { code: 'forbidden' });
        if (!trusted.cookieSecret) state.freshJoins++;
        return { ...grant(), reused: !!trusted.cookieSecret };
      },
      async leave(secret, trusted) { calls.push(['leave', secret, trusted]); state.revoked = true; return { revoked: true, disposition: 'revoked' }; },
      async resolve(secret) {
        calls.push(['resolve', secret]);
        if (secret !== SECRET || state.revoked || state.expiresAt <= state.now) throw Object.assign(new Error('backend secret ' + SECRET), { code: 'forbidden' });
        return grant();
      },
    },
    classroom: {
      async ownSnapshot(owned) { calls.push(['snapshot', owned]); return structuredClone(publicSnapshot); },
      async submit(owned, input) { calls.push(['submit', owned, input]); return { ...publicReceipt }; },
      async ownStanding(owned) { calls.push(['standing', owned]); return { rank: 2, score: 147 }; },
    },
    async verifyAccount(request, trusted) { calls.push(['verify', request, trusted]); return state.principal; },
    rateLimiter: { async consumeAtomic(input) { calls.push(['rate', input]); return { allowed: true }; } },
    trustedSourceKey(trusted) { calls.push(['source', trusted]); return trusted?.source; },
    now: () => state.now,
    ...overrides,
  };
  return { calls, state, options, api: createClassroomHttpBoundary(options) };
}
function request(operation, options = {}) {
  const method = options.method ?? (['join', 'restore', 'submit', 'leave'].includes(operation) ? 'POST' : 'GET');
  const headers = new Headers({ 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', origin });
  if (method === 'POST') headers.set('content-type', 'application/json');
  if (options.cookie !== null) headers.set('cookie', options.cookie ?? `${CLASSROOM_COOKIE}=${SECRET}`);
  for (const [name, value] of Object.entries(options.headers ?? {})) value === null ? headers.delete(name) : headers.set(name, value);
  const body = method === 'POST' ? options.raw ?? options.stream ?? JSON.stringify(options.body ?? (operation === 'join' ? { code: 'LAB001', alias: 'Guest' } : operation === 'submit' ? { index: 0, choice: 0 } : operation === 'leave' ? { intent: 'revoke-session' } : {})) : undefined;
  return new Request(options.url ?? origin + CLASSROOM_HTTP_PATHS[operation], { method, headers, body, ...(options.stream ? { duplex: 'half' } : {}) });
}
const dbCalls = f => f.calls.filter(c => ['join', 'resolve', 'snapshot', 'submit', 'standing', 'leave'].includes(c[0]));
async function checked(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const text = await response.text(); assert.ok(!text.includes(SECRET)); assert.ok(!text.includes(OTHER));
  return JSON.parse(text);
}

test('HTTP: construction requires configured HTTPS and all trusted mandatory adapters', () => {
  const f = fixture();
  for (const badOrigin of [undefined, 'http://classroom.example.test', 'https://user:password@classroom.example.test', origin + '/path', origin + '?x=1', origin + '#fragment']) {
    assert.throws(() => createClassroomHttpBoundary({ ...f.options, origin: badOrigin }), /configuration|HTTPS/);
  }
  for (const key of ['guestSessions', 'classroom', 'verifyAccount', 'rateLimiter', 'trustedSourceKey', 'now']) assert.throws(() => createClassroomHttpBoundary({ ...f.options, [key]: null }), /adapters/);
  assert.equal(Object.hasOwn(f.api, 'claim'), false);
});

test('HTTP: join returns only binding and a host-only secure HttpOnly cookie', async () => {
  const f = fixture(); const response = await f.api.join(request('join', { cookie: null }), context);
  assert.deepEqual(await checked(response, 200), { schemaVersion: 1, sessionId: room, playerId: player, principalId: null });
  const setCookie = response.headers.get('set-cookie');
  assert.equal(setCookie, `${CLASSROOM_COOKIE}=${SECRET}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=99`);
  assert.doesNotMatch(setCookie, /Domain=/i);
  assert.equal(f.calls.find(c => c[0] === 'join')[2].cookieSecret, null);
  assert.equal(f.state.freshJoins, 1);
});

for (const operation of Object.keys(CLASSROOM_HTTP_PATHS)) test(`HTTP: ${operation} enforces exact path, configured URL origin and method`, async () => {
  const f = fixture();
  for (const url of ['https://attacker.example' + CLASSROOM_HTTP_PATHS[operation], origin + '/wrong-path', origin + CLASSROOM_HTTP_PATHS[operation] + '?playerId=' + player]) {
    await checked(await f.api[operation](request(operation, { url, headers: { host: 'classroom.example.test', 'x-forwarded-host': 'classroom.example.test' } }), context), 403);
  }
  const wrong = await f.api[operation](request(operation, { method: 'DELETE' }), context);
  await checked(wrong, 405); assert.equal(wrong.headers.get('allow'), ['join', 'restore', 'submit', 'leave'].includes(operation) ? 'POST' : 'GET');
  assert.equal(dbCalls(f).length, 0);
});

test('HTTP: mutation Origin and Fetch Metadata fail closed, including same-site and missing headers', async () => {
  const f = fixture();
  for (const headers of [
    { origin: null }, { origin: 'null' }, { origin: 'https://attacker.example' },
    { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': null },
    { 'sec-fetch-mode': 'navigate' }, { 'sec-fetch-mode': null }, { 'sec-fetch-dest': 'document' }, { 'sec-fetch-dest': null }, { 'sec-fetch-user': '?1' },
  ]) await checked(await f.api.submit(request('submit', { headers }), context), 403);
  assert.equal(dbCalls(f).length, 0);
});

test('HTTP: read permits absent Origin only with same-origin fetch metadata, and ignores Host/XFF as authority', async () => {
  const f = fixture();
  await checked(await f.api.ownSnapshot(request('ownSnapshot', { headers: { origin: null, host: 'attacker.example', 'x-forwarded-for': 'chosen-victim' } }), context), 200);
  const firstKey = f.calls.find(c => c[0] === 'rate')[1].key;
  await checked(await f.api.ownSnapshot(request('ownSnapshot', { headers: { 'x-forwarded-for': 'different-victim' } }), context), 200);
  assert.equal(f.calls.filter(c => c[0] === 'rate')[1][1].key, firstKey);
  assert.ok(f.calls.filter(c => c[0] === 'source').every(c => c[1] === context));
  await checked(await f.api.ownSnapshot(request('ownSnapshot', { headers: { origin: 'https://attacker.example' } }), context), 403);
  await checked(await f.api.ownSnapshot(request('ownSnapshot', { headers: { 'sec-fetch-site': 'cross-site' } }), context), 403);
});

test('HTTP: cookie-only resolution rejects duplicate, encoded, malformed and ambiguous proofs', async () => {
  const f = fixture();
  for (const cookie of [null, `${CLASSROOM_COOKIE}=`, `${CLASSROOM_COOKIE}=${SECRET}; ${CLASSROOM_COOKIE}=${SECRET}`,
    `${CLASSROOM_COOKIE}=${SECRET}; ${CLASSROOM_COOKIE}=${OTHER}`, `${CLASSROOM_COOKIE}="${SECRET}"`, `${CLASSROOM_COOKIE}=%${SECRET}`,
    `${CLASSROOM_COOKIE}=${SECRET}, ${CLASSROOM_COOKIE}=${OTHER}`, `${CLASSROOM_COOKIE}=${SECRET}x`, `${CLASSROOM_COOKIE}=${SECRET.slice(0, -1)}B`,
    `other=1; other=1; ${CLASSROOM_COOKIE}=${SECRET}`, `malformed; ${CLASSROOM_COOKIE}=${SECRET}`]) {
    await checked(await f.api.restore(request('restore', { cookie }), context), 403);
  }
  assert.equal(dbCalls(f).length, 0);
  const good = await f.api.restore(request('restore', { cookie: `ordinary=hello; ${CLASSROOM_COOKIE}=${SECRET}` }), context);
  await checked(good, 200); assert.deepEqual(f.calls.find(c => c[0] === 'resolve'), ['resolve', SECRET]);
});

test('HTTP: strict input shapes reject body IDs, duplicate keys and nested/invalid values', async () => {
  const f = fixture();
  for (const raw of ['null', '[]', '{}', '{"index":0,"choice":0,"playerId":"' + player + '"}',
    '{"index":0,"choice":0,"choice":1}', '{"index":0,"choice":0,"\\u0063hoice":1}',
    '{"index":{},"choice":0}', '{"index":0,"choice":false}', '{"index":0,"choice":null}',
    '{"index":-1,"choice":0}', '{"index":32768,"choice":0}', '{"index":0,"choice":32}',
    '{"index":0,"choice":1.2}', '{"index":0,"choice":1e999}', '{"index":0,"choice":0,}',
    '{"index":0,"choice":0,"__proto__":"bad"}']) {
    await checked(await f.api.submit(request('submit', { raw }), context), 400);
  }
  await checked(await f.api.restore(request('restore', { body: { sessionId: room, playerId: player, secret: SECRET } }), context), 400);
  assert.equal(dbCalls(f).length, 0);
});

test('HTTP: join bounds Unicode alias bytes, code and control characters', async () => {
  const f = fixture();
  for (const body of [{ code: 'LAB00', alias: 'Guest' }, { code: 'lab001', alias: 'Guest' }, { code: 'LAB001', alias: '' },
    { code: 'LAB001', alias: ' Guest ' }, { code: 'LAB001', alias: 'x\u0000x' }, { code: 'LAB001', alias: 'x\u202Ex' },
    { code: 'LAB001', alias: '😀'.repeat(11) }, { code: 'LAB001', alias: '\ud800' }, { code: 'LAB001', alias: 'Guest', ownerId: accountId }]) {
    await checked(await f.api.join(request('join', { cookie: null, body }), context), 400);
  }
  assert.equal(dbCalls(f).length, 0);
  await checked(await f.api.join(request('join', { cookie: null, body: { code: 'LAB001', alias: '😀'.repeat(10) } }), context), 200);
});

test('HTTP: actual UTF-8 stream size, content type/encoding and content-length are bounded before service calls', async () => {
  const f = fixture();
  for (const headers of [{ 'content-type': 'text/plain' }, { 'content-type': 'application/json; x=1' }, { 'content-type': null },
    { 'content-encoding': 'gzip' }, { 'transfer-encoding': 'chunked' }, { 'content-length': '999999' }, { 'content-length': '1' }]) {
    await checked(await f.api.submit(request('submit', { headers }), context), 400);
  }
  const encoded = new TextEncoder().encode('{"code":"LAB001","alias":"' + '😀'.repeat(300) + '"}');
  assert.ok(encoded.byteLength > 1024);
  await checked(await f.api.join(request('join', { cookie: null, stream: new ReadableStream({ start(c) { c.enqueue(encoded); c.close(); } }) }), context), 400);
  await checked(await f.api.join(request('join', { cookie: null, stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([255, 255])); c.close(); } }) }), context), 400);
  assert.equal(dbCalls(f).length, 0);
});

test('HTTP: stalled request body times out without DB work and cancels the stream', async () => {
  let canceled = false; const f = fixture({ bodyTimeoutMs: 10 });
  const stream = new ReadableStream({ pull() {}, cancel() { canceled = true; } });
  await checked(await f.api.submit(request('submit', { stream }), context), 408);
  assert.equal(canceled, true); assert.equal(dbCalls(f).length, 0);
});

test('HTTP: shared atomic rate limiter denial and failure precede all account and database work', async () => {
  for (const result of [{ allowed: false, retryAfterSeconds: 30 }, {}, null, true, 'throw']) {
    const f = fixture({ rateLimiter: { async consumeAtomic() { if (result === 'throw') throw new Error(SECRET); return result; } } });
    const response = await f.api.join(request('join', { cookie: null }), context);
    await checked(response, result?.allowed === false ? 429 : 503);
    if (result?.allowed === false) assert.equal(response.headers.get('retry-after'), '30');
    assert.equal(dbCalls(f).length, 0); assert.equal(f.calls.filter(c => c[0] === 'verify').length, 0);
  }
  const missingSource = fixture(); await checked(await missingSource.api.restore(request('restore'), {}), 503);
  assert.equal(missingSource.calls.filter(c => c[0] === 'rate').length, 0); assert.equal(dbCalls(missingSource).length, 0);
});

test('HTTP: limiter keys derive only from trusted server context and every operation consumes a shared budget', async () => {
  const f = fixture();
  for (const operation of Object.keys(CLASSROOM_HTTP_PATHS)) await checked(await f.api[operation](request(operation), context), 200);
  const allLimits = f.calls.filter(c => c[0] === 'rate'); assert.equal(allLimits.length, Object.keys(CLASSROOM_HTTP_PATHS).length + 1);
  const limits = allLimits.filter(c => c[1].scope === 'source'); assert.equal(limits.length, Object.keys(CLASSROOM_HTTP_PATHS).length);
  assert.equal(allLimits.filter(c => c[1].scope === 'room').length, 1);
  assert.deepEqual(limits.map(c => c[1].operation), Object.keys(CLASSROOM_HTTP_PATHS));
  assert.ok(limits.every(c => /^[a-f0-9]{64}$/.test(c[1].key) && c[1].key === limits[0][1].key));
});

test('HTTP: verifier errors and malformed principals never downgrade to guest', async () => {
  for (const value of [undefined, {}, { userId: accountId }, { userId: 'bad', isAnonymous: false }, { userId: accountId, isAnonymous: 'false' }, 'throw']) {
    const f = fixture({ async verifyAccount() { if (value === 'throw') throw new Error(SECRET); return value; } });
    await checked(await f.api.restore(request('restore'), context), 503); assert.equal(dbCalls(f).length, 0);
  }
  const f = fixture(); await checked(await f.api.restore(request('restore', { headers: { 'x-user-id': accountId, 'x-is-anonymous': 'false' } }), context), 200);
  assert.equal(f.calls.find(c => c[0] === 'verify')[2], context);
});

test('HTTP: guest possession survives optional verified login without changing stored owner', async () => {
  const f = fixture(); f.state.principal = { userId: accountId, isAnonymous: false };
  const result = await checked(await f.api.restore(request('restore'), context), 200);
  assert.equal(result.principalId, accountId); assert.equal(f.state.ownerId, null);
  await checked(await f.api.join(request('join'), context), 200);
  assert.equal(f.calls.find(c => c[0] === 'join')[2].trustedPrincipal.isAnonymous, false); assert.equal(f.state.freshJoins, 0);
});

test('HTTP: owned session rejects different/no account, and preserves explicit anonymous distinction', async () => {
  for (const principal of [null, { userId: otherAccount, isAnonymous: false }, { userId: accountId, isAnonymous: true }]) {
    const f = fixture(); f.state.ownerId = accountId; f.state.principal = principal;
    await checked(await f.api.restore(request('restore'), context), 403);
    assert.equal(f.calls.filter(c => c[0] === 'snapshot').length, 0);
  }
  const f = fixture(); f.state.ownerId = accountId; f.state.principal = { userId: accountId, isAnonymous: false };
  assert.equal((await checked(await f.api.restore(request('restore'), context), 200)).principalId, accountId);
  const anonymous = fixture(); anonymous.state.principal = { userId: accountId, isAnonymous: true };
  await checked(await anonymous.api.join(request('join', { cookie: null }), context), 200);
  assert.deepEqual(anonymous.calls.find(c => c[0] === 'join')[2].trustedPrincipal, { userId: accountId, isAnonymous: true });
  assert.equal(Object.hasOwn(anonymous.api, 'claim'), false);
});

test('HTTP: expired/revoked backend grants are indistinguishable and never silently cleared or replaced', async () => {
  for (const type of ['expired', 'revoked', 'wrong']) {
    const f = fixture(); if (type === 'expired') f.state.now = f.state.expiresAt; if (type === 'revoked') f.state.revoked = true;
    const response = await f.api.restore(request('restore', { cookie: `${CLASSROOM_COOKIE}=${type === 'wrong' ? OTHER : SECRET}` }), context);
    assert.deepEqual(await checked(response, 403), { error: 'session_unavailable' }); assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(f.state.freshJoins, 0);
  }
});

test('HTTP: snapshot/submit/standing call scoped methods with resolved proof, whitelisting all responses', async () => {
  const f = fixture();
  f.options.classroom.ownSnapshot = async owned => { f.calls.push(['snapshot', owned]); return { ...structuredClone(publicSnapshot), secret: SECRET, roster: [{ alias: 'Private peer' }] }; };
  f.options.classroom.ownStanding = async () => ({ rank: 2, score: 147, secret: SECRET, roster: ['Private peer'] });
  const snapshot = await checked(await f.api.ownSnapshot(request('ownSnapshot'), context), 200);
  assert.deepEqual(snapshot.question.options, ['A', 'B']); assert.equal(snapshot.principalId, null); assert.equal(snapshot.secret, undefined); assert.equal(snapshot.roster, undefined);
  assert.deepEqual(f.calls.find(c => c[0] === 'snapshot')[1], { ...proof, expectedOwnerId: null });
  const receipt = await checked(await f.api.submit(request('submit'), context), 200); assert.deepEqual(receipt.ownReceipt, publicReceipt);
  const submission = f.calls.find(c => c[0] === 'submit'); assert.deepEqual(submission.slice(1), [{ ...proof, expectedOwnerId: null }, { index: 0, choice: 0 }]);
  assert.deepEqual(await checked(await f.api.ownStanding(request('ownStanding'), context), 200), { schemaVersion: 1, sessionId: room, playerId: player, principalId: null, rank: 2, score: 147 });
});

test('HTTP: malformed or secret-bearing server output is never returned', async () => {
  for (const change of [{ playerId: id(99) }, { question: { ...publicSnapshot.question, stem: SECRET } }, { ownReceipt: { ...publicReceipt, correctIndex: 99 } }, { total: undefined }]) {
    const f = fixture(); f.options.classroom.ownSnapshot = async () => ({ ...structuredClone(publicSnapshot), ...change });
    await checked(await f.api.ownSnapshot(request('ownSnapshot'), context), 503);
  }
  const f = fixture(); f.options.guestSessions.resolve = async () => { throw new Error('Database exception ' + SECRET); };
  assert.deepEqual(await checked(await f.api.restore(request('restore'), context), 503), { error: 'service_unavailable' });
});

test('HTTP: scoped stale-answer errors map safely without server exception disclosure', async () => {
  const f = fixture(); f.options.classroom.submit = async () => { throw Object.assign(new Error(SECRET), { code: 'stale-question' }); };
  assert.deepEqual(await checked(await f.api.submit(request('submit'), context), 409), { error: 'game_state_changed' });
});

test('HTTP: lost join acknowledgement reuses received cookie, but no-cookie retry cannot recover by alias', async () => {
  const f = fixture(); await checked(await f.api.join(request('join', { cookie: null }), context), 200);
  assert.equal(f.state.freshJoins, 1);
  await checked(await f.api.join(request('join', { body: { code: 'LAB001', alias: 'Changed display name' } }), context), 200);
  assert.equal(f.state.freshJoins, 1); // Set-Cookie was received despite lost JSON body.
  await checked(await f.api.join(request('join', { cookie: null }), context), 200);
  assert.equal(f.state.freshJoins, 2); // No cookie reached the browser. No alias adoption.
});


test('HTTP: joins consume an independent shared room-code budget before authentication or DB reads', async () => {
  const seen = [];
  const f = fixture({ rateLimiter: { async consumeAtomic(input) { seen.push(input); return { allowed: input.scope !== 'room', retryAfterSeconds: 12 }; } } });
  await checked(await f.api.join(request('join', { cookie: null }), context), 429);
  assert.equal(seen.length, 2); assert.equal(seen[0].scope, 'source'); assert.equal(seen[1].scope, 'room');
  assert.notEqual(seen[0].key, seen[1].key); assert.equal(f.calls.filter(c => c[0] === 'verify').length, 0); assert.equal(dbCalls(f).length, 0);
  await checked(await f.api.join(request('join', { cookie: null }), { source: 'another-trusted-peer' }), 429);
  assert.notEqual(seen[2].key, seen[0].key); assert.equal(seen[3].key, seen[1].key);
});


test('HTTP: every scoped proof carries the server-resolved owner, including explicit null after guest login', async () => {
  for (const ownerId of [null, accountId]) {
    const f = fixture(); f.state.ownerId = ownerId; f.state.principal = { userId: accountId, isAnonymous: false };
    for (const operation of ['ownSnapshot', 'submit', 'ownStanding']) await checked(await f.api[operation](request(operation), context), 200);
    for (const call of f.calls.filter(c => ['snapshot', 'submit', 'standing'].includes(c[0]))) {
      assert.equal(Object.hasOwn(call[1], 'expectedOwnerId'), true); assert.equal(call[1].expectedOwnerId, ownerId);
      assert.equal(Object.isFrozen(call[1]), true);
    }
  }
  const f = fixture(); await checked(await f.api.submit(request('submit', { body: { index: 0, choice: 0, expectedOwnerId: accountId } }), context), 400);
  assert.equal(dbCalls(f).length, 0);
});

const clearCookie = `${CLASSROOM_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
for (const intent of ['revoke-session', 'forget-browser']) test(`HTTP LEAVE: ${intent} requires fixed origin, CSRF, JSON intent and source budget`, async () => {
  for (const patch of [{ headers: { origin: null } }, { headers: { origin: 'https://evil.test' } }, { headers: { 'sec-fetch-site': 'cross-site' } }]) {
    const f = fixture(); const res = await f.api.leave(request('leave', { body: { intent }, ...patch }), context);
    await checked(res, 403); assert.equal(res.headers.get('set-cookie'), null); assert.equal(dbCalls(f).length, 0);
  }
  for (const body of [{}, { intent, playerId: player }, { intent: 'leave' }, { intent: true }, { intent: { intent } }]) {
    const f = fixture(); const res = await f.api.leave(request('leave', { body }), context); await checked(res, 400); assert.equal(res.headers.get('set-cookie'), null);
  }
  const f = fixture({ rateLimiter: { async consumeAtomic() { return { allowed: false }; } } });
  const res = await f.api.leave(request('leave', { body: { intent } }), context); await checked(res, 429); assert.equal(res.headers.get('set-cookie'), null); assert.equal(dbCalls(f).length, 0);
});

test('HTTP LEAVE: explicit local forget works with malformed/duplicate/foreign/no cookie and never reads auth or DB', async () => {
  for (const cookie of [null, `${CLASSROOM_COOKIE}=corrupt`, `${CLASSROOM_COOKIE}=${SECRET}; ${CLASSROOM_COOKIE}=${OTHER}`, `${CLASSROOM_COOKIE}=${OTHER}`]) {
    const f = fixture({ async verifyAccount() { throw Error('auth outage'); } });
    const res = await f.api.leave(request('leave', { cookie, body: { intent: 'forget-browser' } }), context);
    assert.deepEqual(await checked(res, 200), { schemaVersion: 1, disposition: 'left-this-device' });
    assert.equal(res.headers.get('set-cookie'), clearCookie); assert.equal(dbCalls(f).length, 0); assert.equal(f.state.revoked, false);
    assert.deepEqual(f.calls.map(c => c[0]), ['source', 'rate']);
  }
});

test('HTTP LEAVE: revoked and already-inactive outcomes clear only this cookie without leaking grant state', async () => {
  for (const outcome of [{ revoked: true, disposition: 'revoked' }, { revoked: false, disposition: 'already-inactive' }]) {
    const f = fixture(); f.options.guestSessions.leave = async (secret, trusted) => { assert.equal(secret, SECRET); assert.equal(trusted.trustedPrincipal, null); return { ...outcome, secret: SECRET, ownerId: accountId }; };
    const res = await f.api.leave(request('leave'), context); assert.deepEqual(await checked(res, 200), { schemaVersion: 1, disposition: 'left-this-device' });
    assert.equal(res.headers.get('set-cookie'), clearCookie); assert.equal(f.calls.some(c => c[0] === 'resolve'), false);
  }
});

test('HTTP LEAVE: ownership mismatch, auth failure, backend failure and malformed result preserve cookie', async () => {
  for (const outcome of [{ revoked: false, disposition: 'ownership-mismatch' }, { revoked: true, disposition: 'already-inactive' }, null, 'throw']) {
    const f = fixture(); f.options.guestSessions.leave = async () => { if (outcome === 'throw') throw Error(SECRET); return outcome; };
    const res = await f.api.leave(request('leave'), context); await checked(res, outcome?.disposition === 'ownership-mismatch' ? 403 : 503); assert.equal(res.headers.get('set-cookie'), null);
  }
  const f = fixture({ async verifyAccount() { throw Error('outage'); } }); const res = await f.api.leave(request('leave'), context);
  await checked(res, 503); assert.equal(res.headers.get('set-cookie'), null); assert.equal(dbCalls(f).length, 0);
});

test('HTTP LEAVE: revoke rejects malformed or duplicate cookies while absent cookie is idempotent', async () => {
  const f = fixture();
  for (const cookie of [`${CLASSROOM_COOKIE}=bad`, `${CLASSROOM_COOKIE}=${SECRET}; ${CLASSROOM_COOKIE}=${SECRET}`]) {
    const res = await f.api.leave(request('leave', { cookie }), context); await checked(res, 403); assert.equal(res.headers.get('set-cookie'), null);
  }
  const res = await f.api.leave(request('leave', { cookie: null }), context); await checked(res, 200); assert.equal(res.headers.get('set-cookie'), clearCookie); assert.equal(dbCalls(f).length, 0);
});

test('HTTP LEAVE: lost committed acknowledgement preserves cookie on failure and explicit retry clears idempotently', async () => {
  const f = fixture(); let attempts = 0;
  f.options.guestSessions.leave = async () => { attempts++; if (!f.state.revoked) { f.state.revoked = true; throw Error('lost acknowledgement'); } return { revoked: false, disposition: 'already-inactive' }; };
  const first = await f.api.leave(request('leave'), context); await checked(first, 503); assert.equal(first.headers.get('set-cookie'), null);
  assert.equal(f.state.revoked, true);
  const retry = await f.api.leave(request('leave'), context); await checked(retry, 200); assert.equal(retry.headers.get('set-cookie'), clearCookie); assert.equal(attempts, 2);
});
