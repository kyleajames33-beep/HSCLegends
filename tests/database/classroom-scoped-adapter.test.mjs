import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createScopedClassroomService } from '../../lib/classroom-server/scoped-adapter.mjs';
import { hashSessionSecret, sealSessionQuestions } from '../../lib/classroom-server/classroom-core.mjs';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const room = id(1), alice = id(2), bob = id(3), host = id(4), account = id(5);
const otherRoom = id(10), outsider = id(11);
const secret = 'PUBLIC-SYNTHETIC-ALICE-SESSION-000000000000';
const other = 'PUBLIC-SYNTHETIC-BOB-SESSION-00000000000000';
const outsiders = 'PUBLIC-SYNTHETIC-OUTSIDER-SESSION-000000000';
const proof = { sessionId: room, playerId: alice, secret };
const questionSet = sealSessionQuestions([
  { stem: 'Scoped question', options: ['A', 'B'], correctIndex: 0, revision: 'v1' },
  { stem: 'Later question', options: ['C', 'D'], correctIndex: 1, revision: 'v1' },
]);
async function fixture({ realClock = false } = {}) {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('../fixtures/classroom-candidate-schema.sql', import.meta.url), 'utf8'));
  let time = 1000, afterQuery;
  const trace = [];
  const base = realClock ? Date.now() : 0;
  await db.query('insert into auth.users values ($1), ($2)', [host, account]);
  for (const sessionId of [room, otherRoom]) {
    await db.query(`insert into public.game_sessions values
      ($1, $2, 'active', 0, $3, 15, $4, null)`, [sessionId, host, new Date(base).toISOString(), new Date(base + 100000).toISOString()]);
    await db.query('insert into classroom_candidate_private.question_sets values ($1, $2::json)', [sessionId, JSON.stringify(questionSet)]);
  }
  for (const [playerId, sessionId, s] of [[alice, room, secret], [bob, room, other], [outsider, otherRoom, outsiders]]) {
    await db.query("insert into public.game_players values ($1, $2, null, 'Same alias', 0)", [playerId, sessionId]);
    await db.query('insert into classroom_candidate_private.guest_sessions values ($1, $2, $3, $4, false)',
      [playerId, sessionId, hashSessionSecret(s), new Date(base + 50000).toISOString()]);
  }
  const runTransaction = fn => db.transaction(async tx => {
    await tx.query('set transaction isolation level serializable');
    return fn({ async query(text, params = []) {
      trace.push({ text, params: structuredClone(params) });
      // Synthetic deterministic tests deliberately substitute a SQL-returned clock.
      // The separate realClock test uses the adapter's actual clock_timestamp SQL.
      const result = !realClock && text.includes('clock_timestamp()')
        ? await tx.query('select $1::bigint as now_ms', [time]) : await tx.query(text, params);
      if (afterQuery) await afterQuery(text, params);
      return result;
    } });
  });
  return { db, trace, core: createScopedClassroomService({ runTransaction }),
    setTime: value => { time = value; }, setAfterQuery: fn => { afterQuery = fn; } };
}
async function using(fn, options) { const f = await fixture(options); try { await fn(f); } finally { await f.db.close(); } }
const count = async (f, name) => (await f.db.query(`select count(*)::int as n from ${name}`)).rows[0].n;
async function corrupt(f, playerId, sessionId, index = 0) {
  await f.db.query(`insert into public.game_answers
    (session_id, player_id, question_index, choice, is_correct, points, answered_at)
    values ($1, $2, $3, 1, false, 0, to_timestamp(1))`, [sessionId, playerId, index]);
  await f.db.query('insert into classroom_candidate_private.receipts values ($1, $2, $3::json)',
    [playerId, index, JSON.stringify({ playerId: alice, sessionId: room, questionIndex: index, choice: 0 })]);
}

test('scoped PGlite submit persists once across 30 queued changed-choice retries and read-only recovery', () => using(async f => {
  const before = await f.core.snapshot(proof, 0);
  const replies = await Promise.all(Array.from({ length: 30 }, (_, i) => f.core.submit(proof, { index: 0, choice: i % 2 })));
  for (const reply of replies) assert.deepEqual(reply, replies[0]);
  assert.equal(replies[0].points, 147);
  assert.equal(await count(f, 'public.game_answers'), 1);
  assert.equal(await count(f, 'classroom_candidate_private.receipts'), 1);
  f.trace.length = 0;
  const recovered = await f.core.snapshot(proof, 0);
  assert.deepEqual(recovered.question, before.question);
  assert.deepEqual(recovered.ownReceipt, replies[0]);
  assert.ok(f.trace.every(q => !/^\s*(insert|update|delete)\b/i.test(q.text)));
  assert.equal((await f.db.query('select score from public.game_players where id = $1', [alice])).rows[0].score, 147);
}));

test('scoped PGlite corruption in another room, player or question cannot block an unrelated receipt', () => using(async f => {
  const receipt = await f.core.submit(proof, { index: 0, choice: 0 });
  await corrupt(f, bob, room);
  await corrupt(f, outsider, otherRoom);
  await corrupt(f, alice, room, 1);
  assert.deepEqual((await f.core.snapshot(proof, 0)).ownReceipt, receipt);
  assert.deepEqual(await f.core.submit(proof, { index: 0, choice: 1 }), receipt);
  await assert.rejects(f.core.snapshot({ sessionId: room, playerId: bob, secret: other }, 0), e => e.code === 'receipt-integrity-unavailable');
  await assert.rejects(f.core.submit(proof, { index: 1, choice: 1 }), e => e.code === 'receipt-integrity-unavailable');
  assert.equal((await f.core.hostRoster({ userId: host }, room)).length, 2);
  await f.db.query("update public.game_sessions set status = 'complete' where id = $1", [room]);
  assert.deepEqual(await f.core.ownStanding(proof), { score: 147, rank: 1 });
}));

test('scoped PGlite validates every accepted payload field, and matching legacy payload hides the key', () => using(async f => {
  const base = { playerId: alice, sessionId: room, questionIndex: 0, choice: 1, isCorrect: false, points: 0, answeredAt: 1000 };
  await f.db.query(`insert into public.game_answers(session_id, player_id, question_index, choice, is_correct, points, answered_at)
    values ($1, $2, 0, 1, false, 0, to_timestamp(1))`, [room, alice]);
  const variants = { playerId: bob, sessionId: otherRoom, questionIndex: 1, choice: 0, isCorrect: true, points: 147, answeredAt: 1001 };
  for (const [field, value] of Object.entries(variants)) {
    await f.db.query('insert into classroom_candidate_private.receipts values ($1, 0, $2::json)', [alice, JSON.stringify({ ...base, [field]: value })]);
    await assert.rejects(f.core.snapshot(proof, 0), e => e.code === 'receipt-integrity-unavailable', field);
    await f.db.exec('truncate classroom_candidate_private.receipts');
  }
  await f.db.query('insert into classroom_candidate_private.receipts values ($1, 0, $2::json)', [alice, JSON.stringify(base)]);
  const valid = await f.core.snapshot(proof, 0);
  assert.equal(valid.contentStatus, 'historical-content-unavailable');
  assert.equal(valid.question, null);
  assert.equal(valid.ownReceipt.correctIndex, null);
}));

test('scoped PGlite ownership precedes corrupted receipt parsing and unauthorized host roster loading', () => using(async f => {
  await corrupt(f, alice, room);
  f.trace.length = 0;
  await assert.rejects(f.core.snapshot({ ...proof, secret: other }, 0), e => e.code === 'forbidden');
  assert.ok(f.trace.every(q => !/from public\.game_answers|from public\.game_players|from classroom_candidate_private\.question_sets/.test(q.text)));
  f.trace.length = 0;
  await assert.rejects(f.core.hostRoster({ userId: account }, room), e => e.code === 'forbidden');
  assert.ok(f.trace.every(q => !q.text.includes('game_players')));
  await f.db.query('update classroom_candidate_private.guest_sessions set revoked = true where player_id = $1', [alice]);
  await assert.rejects(f.core.snapshot(proof, 0), e => e.code === 'forbidden');
}));

test('scoped PGlite score trigger failure rolls back accepted answer and receipt', () => using(async f => {
  await f.db.exec(`create function public.fail_score() returns trigger language plpgsql as $$ begin raise exception 'injected score failure'; end $$;
    create trigger test_score_failure before update on public.game_players for each row execute function public.fail_score();`);
  await assert.rejects(f.core.submit(proof, { index: 0, choice: 0 }), /injected score failure/);
  assert.equal(await count(f, 'public.game_answers'), 0);
  assert.equal(await count(f, 'classroom_candidate_private.receipts'), 0);
  assert.equal((await f.db.query('select score from public.game_players where id = $1', [alice])).rows[0].score, 0);
  await f.db.exec('drop trigger test_score_failure on public.game_players');
  assert.equal((await f.core.submit(proof, { index: 0, choice: 0 })).points, 147);
}));

test('scoped PGlite NULL start and elapsed window fail closed with no writes', () => using(async f => {
  await f.db.query('update public.game_sessions set question_started_at = null where id = $1', [room]);
  await assert.rejects(f.core.submit(proof, { index: 0, choice: 0 }), e => e.code === 'answer-window-closed');
  await f.db.query('update public.game_sessions set question_started_at = to_timestamp(0) where id = $1', [room]);
  f.setAfterQuery(text => { if (text.includes('for share of a')) f.setTime(15000); });
  await assert.rejects(f.core.submit(proof, { index: 0, choice: 0 }), e => e.code === 'answer-window-closed');
  assert.equal(await count(f, 'public.game_answers'), 0);
}));

test('scoped PGlite rechecks proof expiry after blocking work and before exposing receipt evidence', () => using(async f => {
  await f.core.submit(proof, { index: 0, choice: 0 });
  f.setAfterQuery(text => { if (text.includes('for share of a')) f.setTime(50000); });
  await assert.rejects(f.core.snapshot(proof, 0), e => e.code === 'forbidden');
}));

test('scoped PGlite uses actual database clock when no synthetic clock hook is installed', () => using(async f => {
  const start = Number((await f.db.query('select floor(extract(epoch from clock_timestamp()) * 1000)::bigint as t')).rows[0].t);
  const result = await f.core.submit(proof, { index: 0, choice: 0 });
  const end = Number((await f.db.query('select floor(extract(epoch from clock_timestamp()) * 1000)::bigint as t')).rows[0].t);
  assert.ok(result.answeredAt >= start && result.answeredAt <= end);
}, { realClock: true }));

test('scoped PGlite only queries parameterized operation scope in documented lock order', () => using(async f => {
  await f.core.submit(proof, { index: 0, choice: 0 });
  const queryText = f.trace.map(q => q.text).join('\n');
  assert.ok(!queryText.includes(secret));
  assert.ok(!queryText.includes(alice));
  assert.ok(!queryText.includes('select *'));
  assert.ok(!queryText.includes('test_xp'));
  const reads = f.trace.filter(q => /from (public|classroom_candidate_private)\./.test(q.text));
  for (const q of reads) {
    assert.match(q.text, /where /);
    assert.equal(q.params[0], room);
  }
  const locks = f.trace.filter(q => /for (share|no key update)/.test(q.text));
  assert.match(locks[0].text, /public\.game_sessions/);
  assert.match(locks[1].text, /guest_sessions/);
  assert.match(locks[2].text, /public\.game_players/);
  assert.match(locks[3].text, /public\.game_answers/);
  assert.deepEqual(locks[2].params, [room, alice]);
  assert.deepEqual(locks[3].params, [room, alice, 0]);
}));

test('scoped PGlite host roster and own rank exclude other rooms and avoid unrelated evidence', () => using(async f => {
  await f.db.query('update public.game_players set score = 200 where id = $1', [bob]);
  await f.db.query('update public.game_players set score = 999 where id = $1', [outsider]);
  await f.db.query("update public.game_sessions set status = 'complete' where id = $1", [room]);
  f.trace.length = 0;
  assert.deepEqual(await f.core.ownStanding(proof), { score: 0, rank: 2 });
  assert.ok(f.trace.every(q => !/receipts|question_sets|game_answers/.test(q.text)));
  assert.ok(f.trace.filter(q => q.text.includes('game_players')).every(q => !/alias|user_id/.test(q.text)));
  assert.deepEqual(await f.core.hostRoster({ userId: host }, room), [{ alias: 'Same alias', score: 200 }, { alias: 'Same alias', score: 0 }]);
}));

test('scoped claim fails closed before opening SQL, without synthetic or production XP writes', () => using(async f => {
  await assert.rejects(f.core.claim(proof, { userId: account, isAnonymous: false }), e => e.code === 'claim-integration-unavailable');
  assert.equal(f.trace.length, 0);
  assert.equal(await count(f, 'classroom_candidate_private.claims'), 0);
  assert.equal(await count(f, 'classroom_candidate_private.test_xp'), 0);
}));

test('scoped adapter rejects malformed IDs and out-of-range indices before SQL and copies input scope', () => using(async f => {
  await assert.rejects(f.core.snapshot({ ...proof, sessionId: "x';drop table game_players;--" }, 0), e => e.code === 'forbidden');
  await assert.rejects(f.core.submit(proof, { index: 32768, choice: 0 }), e => e.code === 'invalid-question');
  assert.equal(f.trace.length, 0);
  const mutable = { ...proof }, answer = { index: 0, choice: 0 };
  const pending = f.core.submit(mutable, answer);
  mutable.playerId = bob; mutable.secret = other; answer.choice = 1;
  const receipt = await pending;
  assert.equal(receipt.acceptedChoice, 0);
  assert.equal((await f.db.query('select player_id from public.game_answers')).rows[0].player_id, alice);
}));

test('scoped ownSnapshot discovers locked current index and exposes only safe timing metadata', () => using(async f => {
  const initial = await f.core.ownSnapshot(proof);
  assert.equal(initial.index, 0);
  assert.equal(initial.total, 2);
  assert.equal(initial.startedAt, 0);
  assert.equal(initial.durationMs, 15000);
  assert.equal(initial.isDouble, false);
  assert.ok(!Object.hasOwn(initial.question, 'correctIndex'));
  assert.ok(!Object.hasOwn(initial, 'principalId'));
  assert.ok(!Object.hasOwn(initial, 'revision'));
  await f.db.query('update public.game_sessions set current_index = 1, double_index = 1 where id = $1', [room]);
  const next = await f.core.ownSnapshot(proof);
  assert.equal(next.index, 1);
  assert.equal(next.isDouble, true);
  assert.equal(next.question.stem, 'Later question');
  await assert.rejects(f.core.snapshot(proof, 0), e => e.code === 'stale-question');
}));

test('scoped ownSnapshot retains accepted evidence when total metadata is unavailable', () => using(async f => {
  const receipt = await f.core.submit(proof, { index: 0, choice: 0 });
  // Test-only deliberate corruption of a proposed immutable sidecar.
  await f.db.exec('alter table classroom_candidate_private.question_sets disable trigger question_set_immutable');
  await f.db.query("update classroom_candidate_private.question_sets set payload = '{}'::json where session_id = $1", [room]);
  const snapshot = await f.core.ownSnapshot(proof);
  assert.deepEqual(snapshot.ownReceipt, receipt);
  assert.equal(snapshot.total, null);
  assert.equal(snapshot.question.stem, 'Scoped question');
}));

test('scoped ownSnapshot lobby negative index returns no question and safe timing metadata', () => using(async f => {
  await f.db.query("update public.game_sessions set status = 'lobby', current_index = -1, question_started_at = null where id = $1", [room]);
  const snapshot = await f.core.ownSnapshot(proof);
  assert.equal(snapshot.status, 'lobby');
  assert.equal(snapshot.index, -1);
  assert.equal(snapshot.question, null);
  assert.equal(snapshot.ownReceipt, null);
  assert.equal(snapshot.total, 2);
  assert.equal(snapshot.startedAt, null);
}));

test('scoped ownSnapshot complete at question count composes ownership without nonexistent question lookup', () => using(async f => {
  await f.core.submit(proof, { index: 0, choice: 0 });
  await f.db.query("update public.game_sessions set status = 'complete', current_index = 2 where id = $1", [room]);
  f.trace.length = 0;
  const snapshot = await f.core.ownSnapshot(proof);
  assert.equal(snapshot.status, 'complete');
  assert.equal(snapshot.index, 2);
  assert.equal(snapshot.total, 2);
  assert.equal(snapshot.question, null);
  assert.equal(snapshot.ownReceipt, null);
  assert.ok(f.trace.every(q => !q.text.includes('public.game_answers')));
  assert.deepEqual(await f.core.ownStanding(proof), { score: 147, rank: 1 });
  await assert.rejects(f.core.ownSnapshot({ ...proof, secret: other }), e => e.code === 'forbidden');
}));

test('scoped ownSnapshot legacy complete without a question set still reaches terminal standing', () => using(async f => {
  await f.db.query("update public.game_sessions set status = 'complete', current_index = 5 where id = $1", [room]);
  await f.db.exec('alter table classroom_candidate_private.question_sets disable trigger question_set_immutable');
  await f.db.query('delete from classroom_candidate_private.question_sets where session_id = $1', [room]);
  const snapshot = await f.core.ownSnapshot(proof);
  assert.equal(snapshot.status, 'complete');
  assert.equal(snapshot.question, null);
  assert.equal(snapshot.total, null);
  assert.deepEqual(await f.core.ownStanding(proof), { score: 0, rank: 1 });
}));

test('scoped owner guard denies a post-resolution ownership change before private reads or answer writes', () => using(async f => {
  // Cookie resolution observed null in tx1; another authorized operation changes
  // the owner before this request's independent scoped transaction begins.
  const resolvedProof = { ...proof, expectedOwnerId: null };
  await f.db.query('update public.game_players set user_id=$1 where id=$2', [account, alice]);
  for (const perform of [
    () => f.core.snapshot(resolvedProof, 0),
    () => f.core.ownSnapshot(resolvedProof),
    () => f.core.submit(resolvedProof, { index: 0, choice: 0 }),
  ]) {
    f.trace.length = 0;
    await assert.rejects(perform(), e => e.code === 'forbidden');
    assert.ok(f.trace.every(q => !/game_answers|question_sets|receipts/.test(q.text)));
    assert.ok(f.trace.every(q => !/^\s*(insert|update|delete)\b/.test(q.text)));
  }
  await f.db.query("update public.game_sessions set status='complete' where id=$1", [room]);
  for (const perform of [() => f.core.ownStanding(resolvedProof), () => f.core.ownSnapshot(resolvedProof)]) {
    f.trace.length = 0;
    await assert.rejects(perform(), e => e.code === 'forbidden');
    const playerReads = f.trace.filter(q => q.text.includes('from public.game_players'));
    assert.equal(playerReads.length, 1);
    assert.deepEqual(playerReads[0].params, [room, alice]);
    assert.ok(f.trace.every(q => !/question_sets|game_answers|receipts/.test(q.text)));
  }
  assert.equal(await count(f, 'public.game_answers'), 0);
  assert.equal(await count(f, 'classroom_candidate_private.receipts'), 0);
}));

test('scoped owner guard accepts matching null/account and is copied before asynchronous work', () => using(async f => {
  const nullProof = { ...proof, expectedOwnerId: null };
  assert.equal((await f.core.ownSnapshot(nullProof)).playerId, alice);
  await f.db.query('update public.game_players set user_id=$1 where id=$2', [account, alice]);
  const matched = { ...proof, expectedOwnerId: account };
  const pending = f.core.submit(matched, { index: 0, choice: 0 });
  matched.expectedOwnerId = null;
  assert.equal((await pending).points, 147);
  const persisted = await f.core.snapshot({ ...proof, expectedOwnerId: account }, 0);
  assert.equal(persisted.ownReceipt.points, 147);
  await assert.rejects(f.core.snapshot({ ...proof, expectedOwnerId: host }, 0), e => e.code === 'forbidden');
  await f.db.query("update public.game_sessions set status='complete' where id=$1", [room]);
  assert.deepEqual(await f.core.ownStanding({ ...proof, expectedOwnerId: account }), { score: 147, rank: 1 });
}));

test('scoped owner guard rejects malformed present values before SQL while omission remains compatible', () => using(async f => {
  for (const expectedOwnerId of [undefined, '', 'invalid', 0, false, {}, []]) {
    await assert.rejects(f.core.ownSnapshot({ ...proof, expectedOwnerId }), e => e.code === 'forbidden');
  }
  assert.equal(f.trace.length, 0);
  assert.equal((await f.core.ownSnapshot(proof)).playerId, alice);
}));
