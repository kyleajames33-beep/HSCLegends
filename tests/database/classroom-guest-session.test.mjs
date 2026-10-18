import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createGuestSessionService } from '../../lib/classroom-server/guest-session.mjs';
import { createScopedClassroomService } from '../../lib/classroom-server/scoped-adapter.mjs';
import { hashSessionSecret, sealSessionQuestions } from '../../lib/classroom-server/classroom-core.mjs';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const room = id(1), otherRoom = id(2), account = id(3), foreign = id(4);
// Public deterministic fixtures, not credentials. Never call the runtime CSPRNG.
const synthetic = n => Buffer.alloc(32, n).toString('base64url');
const input = { code: 'ABC123', alias: 'Synthetic guest' };
const principal = { userId: account, isAnonymous: false };
const questions = [{ stem: 'Synthetic question', options: ['A','B'], correctIndex: 0, revision: 'v1' }];
async function fixture(options = {}) {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('../fixtures/classroom-upgrade-baseline.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../docs/classroom-recovery/proposals/classroom-upgrade.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values ($1),($2)', [account, foreign]);
  for (const [sessionId, code] of [[room, 'ABC123'], [otherRoom, 'XYZ987']]) {
    await db.query(`insert into public.game_sessions (id,code,subject,question_ids,status,current_index,question_started_at,expires_at)
      values ($1,$2,'biology',array['q1'],$3,$4,to_timestamp(0),to_timestamp(100))`,
    [sessionId, code, options.status ?? 'lobby', options.status === 'active' ? 0 : -1]);
    await db.query('insert into classroom_candidate_private.question_sets values ($1,$2::json)', [sessionId, JSON.stringify(sealSessionQuestions(questions))]);
  }
  let time = 1000, generated = 0, afterQuery;
  const trace = [];
  const runTransaction = fn => db.transaction(async tx => {
    await tx.query('set transaction isolation level serializable');
    return fn({ async query(text, params = []) {
      trace.push({ text, params: structuredClone(params) });
      const result = text.includes('clock_timestamp()') ? await tx.query('select $1::bigint as now_ms', [time]) : await tx.query(text, params);
      if (afterQuery) await afterQuery(text, params);
      return result;
    } });
  });
  const createSecret = options.createSecret ?? (() => { generated++; return synthetic(generated); });
  const service = createGuestSessionService({ runTransaction, createSecret, ttlMs: options.ttlMs ?? 10000 });
  return { db, trace, service, scoped: createScopedClassroomService({ runTransaction }), runTransaction,
    get generated() { return generated; }, setTime: t => { time = t; }, setAfterQuery: f => { afterQuery = f; } };
}
async function using(fn, options) { const f = await fixture(options); try { await fn(f); } finally { await f.db.close(); } }
const count = async (f, table) => (await f.db.query(`select count(*)::int as n from ${table}`)).rows[0].n;

test('guest issuance stores only a unique secret hash and returns server-owned proof after atomic commit', () => using(async f => {
  const joined = await f.service.join({ code: ' abc123 ', alias: ' Synthetic guest ' });
  assert.equal(joined.proof.sessionId, room);
  assert.equal(joined.proof.secret, synthetic(1));
  assert.equal(joined.ownerId, null);
  assert.equal(joined.expiresAt, 11000);
  assert.equal(joined.reused, false);
  const player = (await f.db.query('select session_id,user_id,alias,score from public.game_players')).rows[0];
  assert.deepEqual(player, { session_id: room, user_id: null, alias: 'Synthetic guest', score: 0 });
  const grant = (await f.db.query('select player_id,session_id,secret_hash,expires_at,revoked from classroom_candidate_private.guest_sessions')).rows[0];
  assert.equal(grant.player_id, joined.proof.playerId);
  assert.equal(grant.secret_hash, hashSessionSecret(synthetic(1)));
  assert.equal(new Date(grant.expires_at).getTime(), 11000);
  assert.equal(grant.revoked, false);
  assert.ok(f.trace.every(q => !JSON.stringify(q).includes(synthetic(1))));
  assert.equal(f.generated, 1);
}));

test('guest resolver accepts only secret and derives IDs; scoped service revalidates after resolution', () => using(async f => {
  const joined = await f.service.join(input);
  f.trace.length = 0;
  const restored = await f.service.resolve(joined.proof.secret);
  assert.deepEqual(restored, { proof: joined.proof, ownerId: null, expiresAt: joined.expiresAt });
  assert.ok(f.trace.every(q => !/^\s*(insert|update|delete)/.test(q.text)));
  await assert.rejects(f.service.resolve({ secret: joined.proof.secret, playerId: id(99) }), e => e.code === 'forbidden');
  const before = await f.scoped.ownSnapshot(restored.proof);
  assert.equal(before.status, 'lobby');
  await f.db.query('update classroom_candidate_private.guest_sessions set revoked=true where player_id=$1', [joined.proof.playerId]);
  await assert.rejects(f.scoped.ownSnapshot(restored.proof), e => e.code === 'forbidden');
  await assert.rejects(f.service.resolve(joined.proof.secret), e => e.code === 'forbidden');
}));

test('guest same-room cookie retry preserves player, alias, score, secret and expiry without a new grant', () => using(async f => {
  const joined = await f.service.join(input);
  await f.db.query('update public.game_players set score=99 where id=$1', [joined.proof.playerId]);
  f.setTime(5000); f.trace.length = 0;
  const retry = await f.service.join({ code: 'ABC123', alias: 'Changed alias' }, { cookieSecret: joined.proof.secret });
  assert.deepEqual(retry, { ...joined, reused: true });
  assert.equal(f.generated, 1);
  assert.ok(f.trace.every(q => !/^\s*(insert|update|delete)/.test(q.text)));
  assert.equal(await count(f, 'public.game_players'), 1);
  assert.deepEqual((await f.db.query('select alias,score from public.game_players')).rows[0], { alias: 'Synthetic guest', score: 99 });
}));

test('guest retries without cookie never adopt matching alias and can create a duplicate after a lost first response', () => using(async f => {
  const a = await f.service.join(input), b = await f.service.join(input);
  assert.notEqual(a.proof.playerId, b.proof.playerId);
  assert.notEqual(a.proof.secret, b.proof.secret);
  assert.equal(await count(f, 'public.game_players'), 2);
  assert.equal(await count(f, 'classroom_candidate_private.guest_sessions'), 2);
}));

test('guest authenticated join binds verified nonanonymous owner; foreign or logged-out reuse fails closed', () => using(async f => {
  const joined = await f.service.join(input, { trustedPrincipal: principal });
  assert.equal(joined.ownerId, account);
  assert.equal((await f.service.resolve(joined.proof.secret)).ownerId, account);
  assert.equal((await f.service.join(input, { cookieSecret: joined.proof.secret, trustedPrincipal: principal })).reused, true);
  for (const who of [null, { userId: foreign, isAnonymous: false }, { userId: account, isAnonymous: true }]) {
    await assert.rejects(f.service.join(input, { cookieSecret: joined.proof.secret, trustedPrincipal: who }), e => e.code === 'forbidden');
  }
  assert.equal(f.generated, 1);
  assert.equal(await count(f, 'public.game_players'), 1);
  assert.equal((await f.db.query('select user_id from public.game_players')).rows[0].user_id, account);
}));

test('guest can retain possession through verified sign-in without silently changing owner; anonymous auth stays guest', () => using(async f => {
  const joined = await f.service.join(input);
  const retry = await f.service.join(input, { cookieSecret: joined.proof.secret, trustedPrincipal: principal });
  assert.equal(retry.ownerId, null);
  assert.deepEqual(retry.proof, joined.proof);
  assert.equal((await f.db.query('select user_id from public.game_players where id=$1', [joined.proof.playerId])).rows[0].user_id, null);
  const anonymous = await f.service.join(input, { trustedPrincipal: { userId: account, isAnonymous: true } });
  assert.equal(anonymous.ownerId, null);
}));

test('guest invalid, expired, revoked and other-room cookies never create replacements or reset expiry', () => using(async f => {
  const joined = await f.service.join(input);
  await assert.rejects(f.service.join(input, { cookieSecret: synthetic(99) }), e => e.code === 'forbidden');
  await assert.rejects(f.service.join({ ...input, code: 'XYZ987' }, { cookieSecret: joined.proof.secret }), e => e.code === 'forbidden');
  f.setTime(11000);
  await assert.rejects(f.service.join(input, { cookieSecret: joined.proof.secret }), e => e.code === 'forbidden');
  await assert.rejects(f.service.resolve(joined.proof.secret), e => e.code === 'forbidden');
  f.setTime(1000);
  await f.db.query('update classroom_candidate_private.guest_sessions set revoked=true where player_id=$1', [joined.proof.playerId]);
  await assert.rejects(f.service.join(input, { cookieSecret: joined.proof.secret }), e => e.code === 'forbidden');
  assert.equal(f.generated, 1);
  assert.equal(await count(f, 'public.game_players'), 1);
}));

test('guest joins lobby or active rooms but never complete, expired or unknown rooms', () => using(async f => {
  const joined = await f.service.join(input);
  assert.ok(joined.proof.playerId);
  await f.db.query("update public.game_sessions set status='active',current_index=0 where id=$1", [room]);
  const active = await f.service.join(input);
  assert.equal((await f.scoped.ownSnapshot(active.proof)).question.stem, 'Synthetic question');
  await f.db.query("update public.game_sessions set status='complete' where id=$1", [room]);
  await assert.rejects(f.service.join(input), e => e.code === 'room-unavailable');
  // Existing possession still restores completed rooms for owned standings.
  assert.equal((await f.service.resolve(joined.proof.secret)).proof.sessionId, room);
  await f.db.query("update public.game_sessions set status='lobby' where id=$1", [room]);
  f.setTime(100000);
  await assert.rejects(f.service.join(input), e => e.code === 'room-unavailable');
  await assert.rejects(f.service.resolve(joined.proof.secret), e => e.code === 'forbidden');
  await assert.rejects(f.service.join({ ...input, code: 'NONE99' }), e => e.code === 'room-unavailable');
  assert.equal(await count(f, 'public.game_players'), 2);
}));

test('guest secure issuance refuses missing, corrupt or count-mismatched frozen questions without lazy writes', () => using(async f => {
  await f.db.query('delete from classroom_candidate_private.question_sets where session_id=$1', [room]);
  for (const payload of [null, {}, { ...sealSessionQuestions(questions), fingerprint: 'broken' }, sealSessionQuestions([...questions, ...questions])]) {
    if (payload !== null) await f.db.query('insert into classroom_candidate_private.question_sets values($1,$2::json)', [room, JSON.stringify(payload)]);
    await assert.rejects(f.service.join(input), e => e.code === 'unverified-question');
    await f.db.query('delete from classroom_candidate_private.question_sets where session_id=$1', [room]);
  }
  assert.equal(f.generated, 0);
  assert.equal(await count(f, 'public.game_players'), 0);
}));

test('guest TTL is bounded by configured lifetime and room expiry, sampled after all pre-insert locks', () => using(async f => {
  f.setAfterQuery(text => { if (text.includes('from classroom_candidate_private.question_sets')) f.setTime(95000); });
  const joined = await f.service.join(input);
  assert.equal(joined.expiresAt, 100000);
  f.setAfterQuery(null); f.setTime(99999);
  assert.equal((await f.service.resolve(joined.proof.secret)).expiresAt, 100000);
  f.setTime(100000);
  await assert.rejects(f.service.resolve(joined.proof.secret), e => e.code === 'forbidden');
}));

test('guest room expiry while acquiring the frozen-set lock prevents insertion and credential generation', () => using(async f => {
  f.setAfterQuery(text => { if (text.includes('from classroom_candidate_private.question_sets')) f.setTime(100000); });
  await assert.rejects(f.service.join(input), e => e.code === 'room-unavailable');
  assert.equal(f.generated, 0);
  assert.equal(await count(f, 'public.game_players'), 0);
}));

test('guest issuance rolls back player and grant if expiry occurs during a blocking INSERT', () => using(async f => {
  f.setAfterQuery(text => { if (text.includes('insert into classroom_candidate_private.guest_sessions')) f.setTime(11000); });
  await assert.rejects(f.service.join(input), e => e.code === 'forbidden');
  assert.equal(await count(f, 'public.game_players'), 0);
  assert.equal(await count(f, 'classroom_candidate_private.guest_sessions'), 0);
}));

test('guest SQL grant failure and secret-hash collision roll back newly inserted player rows', () => using(async f => {
  await f.db.exec(`create function public.fail_grant() returns trigger language plpgsql as $$ begin raise exception 'injected grant failure'; end $$;
    create trigger test_grant_failure before insert on classroom_candidate_private.guest_sessions for each row execute function public.fail_grant();`);
  await assert.rejects(f.service.join(input), /injected grant failure/);
  assert.equal(await count(f, 'public.game_players'), 0);
  await f.db.exec('drop trigger test_grant_failure on classroom_candidate_private.guest_sessions');
  const sameSecret = createGuestSessionService({ runTransaction: f.runTransaction, createSecret: () => synthetic(20) });
  await sameSecret.join(input);
  await assert.rejects(sameSecret.join(input), e => e.code === '23505');
  assert.equal(await count(f, 'public.game_players'), 1);
  assert.equal(await count(f, 'classroom_candidate_private.guest_sessions'), 1);
}));

test('guest bounded input, secret canonicalization, principal and factory validation fail before unsafe writes', () => using(async f => {
  for (const invalid of [{ code: "';drop", alias: 'Safe' }, { code: 'ABC12', alias: 'Safe' }, { ...input, alias: '' },
    { ...input, alias: 'x'.repeat(21) }, { ...input, alias: 'a\nb' }, { ...input, code: 'x'.repeat(100) }]) {
    await assert.rejects(f.service.join(invalid), e => e.code === 'invalid-join');
  }
  for (const invalid of [null, '', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + 'B', 'A'.repeat(42) + '=']) {
    await assert.rejects(f.service.resolve(invalid), e => e.code === 'forbidden');
  }
  await assert.rejects(f.service.join(input, { trustedPrincipal: { userId: account } }), e => e.code === 'forbidden');
  assert.equal(f.trace.length, 0);
  const bad = createGuestSessionService({ runTransaction: f.runTransaction, createSecret: () => 'x'.repeat(32) });
  await assert.rejects(bad.join(input), e => e.code === 'session-secret-unavailable');
  assert.equal(await count(f, 'public.game_players'), 0);
  for (const ttlMs of [0, -1, 21600001, 1.5, NaN]) {
    assert.throws(() => createGuestSessionService({ runTransaction: f.runTransaction, createSecret: () => synthetic(1), ttlMs }), /Invalid guest-session TTL/);
  }
}));

test('guest resolver locks session then re-read grant then player; expiry after final lock is denied', () => using(async f => {
  const joined = await f.service.join(input);
  f.trace.length = 0;
  f.setAfterQuery(text => { if (text.includes('from public.game_players')) f.setTime(11000); });
  await assert.rejects(f.service.resolve(joined.proof.secret), e => e.code === 'forbidden');
  const locks = f.trace.filter(q => q.text.includes('for share'));
  assert.match(locks[0].text, /game_sessions/);
  assert.match(locks[1].text, /guest_sessions/);
  assert.match(locks[2].text, /game_players/);
  assert.deepEqual(f.trace[0].params, [hashSessionSecret(joined.proof.secret)]);
  assert.ok(f.trace.every(q => !q.text.includes(joined.proof.playerId) && !q.text.includes(joined.proof.secret)));
}));

test('guest revoked or expired locked grant never triggers private player reads during restore or cookie reuse', () => using(async f => {
  const joined = await f.service.join(input);
  for (const state of ['expired', 'revoked']) {
    f.setTime(state === 'expired' ? joined.expiresAt : 1000);
    await f.db.query('update classroom_candidate_private.guest_sessions set revoked=$1 where player_id=$2', [state === 'revoked', joined.proof.playerId]);
    for (const operation of [
      () => f.service.resolve(joined.proof.secret),
      () => f.service.join(input, { cookieSecret: joined.proof.secret }),
    ]) {
      f.trace.length = 0;
      await assert.rejects(operation(), e => e.code === 'forbidden');
      assert.ok(f.trace.every(q => !q.text.includes('from public.game_players')), state);
      assert.ok(f.trace.every(q => !/^\s*(insert|update|delete)\b/.test(q.text)), state);
    }
  }
  assert.equal(f.generated, 1);
  assert.equal(await count(f, 'public.game_players'), 1);
}));

test('guest cookie reuse still rejects expiry crossed while acquiring the private player lock', () => using(async f => {
  const joined = await f.service.join(input);
  f.trace.length = 0;
  f.setAfterQuery(text => { if (text.includes('from public.game_players')) f.setTime(joined.expiresAt); });
  await assert.rejects(f.service.join(input, { cookieSecret: joined.proof.secret }), e => e.code === 'forbidden');
  assert.equal(f.trace.filter(q => q.text.includes('from public.game_players')).length, 1);
  assert.ok(f.trace.every(q => !/^\s*(insert|update|delete)\b/.test(q.text)));
  assert.equal(f.generated, 1);
}));

test('guest leave revokes only the cookie grant, preserves player state, and blocks captured proof reuse', () => using(async f => {
  const joined = await f.service.join(input), other = await f.service.join({ ...input, code: 'XYZ987' });
  await f.db.query('update public.game_players set score=99 where id=$1', [joined.proof.playerId]);
  const before = (await f.db.query('select id,session_id,user_id,alias,score from public.game_players order by id')).rows;
  f.trace.length = 0;
  assert.deepEqual(await f.service.leave(joined.proof.secret), { revoked: true, disposition: 'revoked' });
  const leaveTrace = structuredClone(f.trace);
  assert.deepEqual((await f.db.query('select id,session_id,user_id,alias,score from public.game_players order by id')).rows, before);
  assert.equal(await count(f, 'classroom_candidate_private.guest_sessions'), 2);
  assert.equal((await f.service.resolve(other.proof.secret)).proof.playerId, other.proof.playerId);
  await assert.rejects(f.service.resolve(joined.proof.secret), e => e.code === 'forbidden');
  await assert.rejects(f.scoped.ownSnapshot(joined.proof), e => e.code === 'forbidden');
  await assert.rejects(f.service.join(input, { cookieSecret: joined.proof.secret }), e => e.code === 'forbidden');
  const mutations = leaveTrace.filter(q => /^\s*(insert|update|delete)\b/.test(q.text));
  assert.equal(mutations.length, 1);
  assert.match(mutations[0].text, /^update classroom_candidate_private\.guest_sessions set revoked = true/);
  assert.deepEqual(mutations[0].params, [room, joined.proof.playerId, hashSessionSecret(joined.proof.secret)]);
  assert.ok(leaveTrace.every(q => !/question_sets|receipts|game_answers/.test(q.text)));
  assert.ok(leaveTrace.every(q => !JSON.stringify(q).includes(joined.proof.secret)));
  // After HTTP discards its cookie, an explicit different-room join is fresh.
  const switched = await f.service.join({ ...input, code: 'XYZ987' });
  assert.equal(switched.proof.sessionId, otherRoom);
  assert.notEqual(switched.proof.playerId, joined.proof.playerId);
}));

test('guest leave is idempotent for unknown, revoked and expired grants without private player reads', () => using(async f => {
  const joined = await f.service.join(input);
  const inactive = { revoked: false, disposition: 'already-inactive' };
  for (const state of ['unknown', 'expired-grant', 'expired-room', 'revoked']) {
    f.setTime(state === 'expired-grant' ? joined.expiresAt : 1000);
    await f.db.query('update public.game_sessions set expires_at=to_timestamp($1) where id=$2', [state === 'expired-room' ? 1 : 100, room]);
    await f.db.query('update classroom_candidate_private.guest_sessions set revoked=$1 where player_id=$2', [state === 'revoked', joined.proof.playerId]);
    f.trace.length = 0;
    assert.deepEqual(await f.service.leave(state === 'unknown' ? synthetic(99) : joined.proof.secret), inactive, state);
    assert.ok(f.trace.every(q => !q.text.includes('from public.game_players')), state);
    assert.ok(f.trace.every(q => !/^\s*(insert|update|delete)\b/.test(q.text)), state);
  }
  assert.equal(f.generated, 1);
}));

test('guest leave requires exact nonanonymous owner and preserves the grant on ownership mismatch', () => using(async f => {
  const joined = await f.service.join(input, { trustedPrincipal: principal });
  for (const who of [null, { userId: foreign, isAnonymous: false }, { userId: account, isAnonymous: true }]) {
    f.trace.length = 0;
    assert.deepEqual(await f.service.leave(joined.proof.secret, { trustedPrincipal: who }),
      { revoked: false, disposition: 'ownership-mismatch' });
    assert.ok(f.trace.every(q => !/^\s*(insert|update|delete)\b/.test(q.text)));
    assert.equal((await f.db.query('select revoked from classroom_candidate_private.guest_sessions where player_id=$1', [joined.proof.playerId])).rows[0].revoked, false);
  }
  await f.db.query("update public.game_sessions set status='complete' where id=$1", [room]);
  assert.deepEqual(await f.service.leave(joined.proof.secret, { trustedPrincipal: principal }), { revoked: true, disposition: 'revoked' });
  // Lost response can be retried even after an auth switch; no active grant remains.
  assert.deepEqual(await f.service.leave(joined.proof.secret), { revoked: false, disposition: 'already-inactive' });
  assert.equal((await f.db.query('select user_id from public.game_players where id=$1', [joined.proof.playerId])).rows[0].user_id, account);
}));

test('guest leave accepts null-owner possession after optional sign-in without adopting account ownership', () => using(async f => {
  for (const who of [null, principal, { userId: account, isAnonymous: true }]) {
    const joined = await f.service.join(input);
    assert.deepEqual(await f.service.leave(joined.proof.secret, { trustedPrincipal: who }), { revoked: true, disposition: 'revoked' });
    assert.equal((await f.db.query('select user_id from public.game_players where id=$1', [joined.proof.playerId])).rows[0].user_id, null);
  }
}));

test('guest leave locks session then grant then player and rechecks expiry after the final lock', () => using(async f => {
  const joined = await f.service.join(input);
  f.trace.length = 0;
  f.setAfterQuery(text => { if (text.includes('from public.game_players')) f.setTime(joined.expiresAt); });
  assert.deepEqual(await f.service.leave(joined.proof.secret), { revoked: false, disposition: 'already-inactive' });
  const locks = f.trace.filter(q => /for (share|update)/.test(q.text));
  assert.match(locks[0].text, /game_sessions[\s\S]+for share/);
  assert.match(locks[1].text, /guest_sessions[\s\S]+for update/);
  assert.match(locks[2].text, /game_players[\s\S]+for share/);
  assert.ok(f.trace.every(q => !/^\s*(insert|update|delete)\b/.test(q.text)));
  assert.equal((await f.db.query('select revoked from classroom_candidate_private.guest_sessions where player_id=$1', [joined.proof.playerId])).rows[0].revoked, false);
}));

test('guest leave rejects malformed proof or principal before SQL and snapshots the trusted principal before await', () => using(async f => {
  const joined = await f.service.join(input, { trustedPrincipal: principal });
  f.trace.length = 0;
  for (const secret of [null, '', { secret: joined.proof.secret }, 'A'.repeat(42) + 'B']) {
    await assert.rejects(f.service.leave(secret), e => e.code === 'forbidden');
  }
  for (const who of [{ userId: account }, { userId: 'invalid', isAnonymous: false }]) {
    await assert.rejects(f.service.leave(joined.proof.secret, { trustedPrincipal: who }), e => e.code === 'forbidden');
  }
  assert.equal(f.trace.length, 0);
  const mutable = { userId: foreign, isAnonymous: false };
  f.setAfterQuery(() => { mutable.userId = account; });
  assert.deepEqual(await f.service.leave(joined.proof.secret, { trustedPrincipal: mutable }),
    { revoked: false, disposition: 'ownership-mismatch' });
  f.setAfterQuery(null);
  const anonymous = { userId: account, isAnonymous: true };
  f.setAfterQuery(() => { anonymous.isAnonymous = false; });
  assert.deepEqual(await f.service.leave(joined.proof.secret, { trustedPrincipal: anonymous }),
    { revoked: false, disposition: 'ownership-mismatch' });
}));

test('guest leave SQL failure rolls back revocation and is never reported as success', () => using(async f => {
  const joined = await f.service.join(input);
  await f.db.exec(`create function public.fail_leave() returns trigger language plpgsql as $$ begin raise exception 'injected leave failure'; end $$;
    create trigger test_leave_failure after update on classroom_candidate_private.guest_sessions for each row execute function public.fail_leave();`);
  await assert.rejects(f.service.leave(joined.proof.secret), /injected leave failure/);
  assert.equal((await f.db.query('select revoked from classroom_candidate_private.guest_sessions where player_id=$1', [joined.proof.playerId])).rows[0].revoked, false);
  assert.equal((await f.service.resolve(joined.proof.secret)).proof.playerId, joined.proof.playerId);
  await f.db.exec('drop trigger test_leave_failure on classroom_candidate_private.guest_sessions');
  assert.deepEqual(await f.service.leave(joined.proof.secret), { revoked: true, disposition: 'revoked' });
  assert.deepEqual(await f.service.leave(joined.proof.secret), { revoked: false, disposition: 'already-inactive' });
}));
