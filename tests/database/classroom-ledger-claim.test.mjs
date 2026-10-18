import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createLedgerClaimService } from '../../lib/classroom-server/ledger-claim.mjs';
import { hashSessionSecret } from '../../lib/classroom-server/classroom-core.mjs';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const room = id(1), alice = id(2), bob = id(3), host = id(4), account = id(5), foreign = id(6);
const secret = 'PUBLIC-SYNTHETIC-ALICE-SESSION-000000000000';
const other = 'PUBLIC-SYNTHETIC-BOB-SESSION-00000000000000';
const proof = { sessionId: room, playerId: alice, secret };
const principal = { userId: account, isAnonymous: false };
const reason = `live_game:${alice}`;
async function fixture() {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('../fixtures/classroom-candidate-schema.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../fixtures/classroom-ledger-schema.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values ($1), ($2), ($3)', [host, account, foreign]);
  await db.query('insert into public.user_profiles values ($1), ($2)', [account, foreign]);
  await db.query(`insert into public.game_sessions
    (id, host_id, status, current_index, question_started_at, per_question_seconds, expires_at, double_index, subject)
    values ($1, $2, 'complete', 2, to_timestamp(0), 15, to_timestamp(100), null, 'physics')`, [room, host]);
  for (const [player, s, score] of [[alice, secret, 147], [bob, other, 20]]) {
    await db.query("insert into public.game_players values ($1, $2, null, 'Same alias', $3)", [player, room, score]);
    await db.query('insert into classroom_candidate_private.guest_sessions values ($1, $2, $3, to_timestamp(50), false)', [player, room, hashSessionSecret(s)]);
  }
  let time = 1000, afterQuery;
  const trace = [];
  const runTransaction = fn => db.transaction(async tx => {
    await tx.query('set transaction isolation level serializable');
    return fn({ async query(text, params = []) {
      trace.push({ text, params: structuredClone(params) });
      const result = text.includes('clock_timestamp()')
        ? await tx.query('select $1::bigint as now_ms', [time]) : await tx.query(text, params);
      if (afterQuery) await afterQuery(text, params);
      return result;
    } });
  });
  return { db, trace, core: createLedgerClaimService({ runTransaction }),
    setTime: value => { time = value; }, setAfterQuery: fn => { afterQuery = fn; } };
}
async function using(fn) { const f = await fixture(); try { await fn(f); } finally { await f.db.close(); } }
const count = async (f, table) => (await f.db.query(`select count(*)::int as n from ${table}`)).rows[0].n;
const stats = async f => (await f.db.query('select total_xp::text as xp, coins::text as coins from public.user_stats where user_id = $1', [account])).rows[0];
async function seedEvent(f, { userId = account, reasonKey = reason, amount = 147, kind = 'xp', subject = 'physics' } = {}) {
  return (await f.db.query('insert into public.xp_events(user_id, reason_key, amount, kind, subject) values ($1, $2, $3, $4, $5) returning id',
    [userId, reasonKey, amount, kind, subject])).rows[0].id;
}
async function seedStats(f, total = '147', coins = '11') {
  await f.db.query('insert into public.user_stats(user_id, total_xp, coins) values ($1, $2::bigint, $3::bigint)', [account, total, coins]);
}
async function seedMarker(f, eventId, patch = {}) {
  const m = { player: alice, session: room, user: account, awarded: 147, reasonKey: reason, kind: 'xp', subject: 'physics', disposition: 'awarded', ...patch };
  await f.db.query(`insert into classroom_ledger_candidate_private.claims
    (player_id, session_id, user_id, event_id, awarded, reason_key, kind, subject, disposition)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [m.player, m.session, m.user, eventId, m.awarded, m.reasonKey, m.kind, m.subject, m.disposition]);
}
async function assertEmptyAward(f) {
  assert.equal(await count(f, 'public.xp_events'), 0);
  assert.equal(await count(f, 'classroom_ledger_candidate_private.claims'), 0);
  assert.equal(await count(f, 'public.user_stats'), 0);
}

test('ledger fresh claim writes exact production-shaped event/aggregate and one immutable global marker', () => using(async f => {
  const result = await f.core.claim(proof, principal);
  assert.deepEqual(result, { schemaVersion: 1, playerId: alice, userId: account, awarded: 147, totalXp: '147', disposition: 'awarded' });
  const event = (await f.db.query('select user_id, reason_key, amount, kind, subject from public.xp_events')).rows[0];
  assert.deepEqual(event, { user_id: account, reason_key: reason, amount: 147, kind: 'xp', subject: 'physics' });
  assert.deepEqual(await stats(f), { xp: '147', coins: '0' });
  assert.equal(await count(f, 'classroom_ledger_candidate_private.claims'), 1);
  assert.equal((await f.db.query('select user_id from public.game_players where id=$1', [alice])).rows[0].user_id, null);
  assert.equal(await count(f, 'classroom_candidate_private.test_xp'), 0);
  await assert.rejects(f.db.query('update classroom_ledger_candidate_private.claims set awarded=0 where player_id=$1', [alice]), /immutable candidate evidence/);
  await assert.rejects(f.db.query('delete from classroom_ledger_candidate_private.claims where player_id=$1', [alice]), /immutable candidate evidence/);
}));

test('ledger 30 queued retries award once and immutable destination blocks another verified account', () => using(async f => {
  const replies = await Promise.all(Array.from({ length: 30 }, () => f.core.claim(proof, principal)));
  assert.equal(replies.filter(r => r.disposition === 'awarded').length, 1);
  assert.equal(replies.filter(r => r.disposition === 'replayed').length, 29);
  for (const r of replies) { assert.equal(r.awarded, 147); assert.equal(r.totalXp, '147'); }
  await assert.rejects(f.core.claim(proof, { userId: foreign, isAnonymous: false }), e => e.code === 'claim-reconciliation-required');
  assert.equal(await count(f, 'public.xp_events'), 1);
  assert.equal(await count(f, 'classroom_ledger_candidate_private.claims'), 1);
  assert.equal((await stats(f)).xp, '147');
}));

test('ledger signed-in owner is not an already-claimed marker and ownership never transfers', () => using(async f => {
  await f.db.query('update public.game_players set user_id=$1 where id=$2', [account, alice]);
  await assert.rejects(f.core.claim(proof, { userId: foreign, isAnonymous: false }), e => e.code === 'forbidden');
  assert.equal((await f.core.claim(proof, principal)).awarded, 147);
  assert.equal((await f.db.query('select user_id from public.game_players where id=$1', [alice])).rows[0].user_id, account);
}));

test('ledger requires possession, non-anonymous trusted identity and completion before reading ledger', () => using(async f => {
  const denied = [
    [{ ...proof, secret: other }, principal],
    [{ ...proof, playerId: bob }, principal],
    [proof, { userId: account, isAnonymous: true }],
    [proof, { userId: account }],
    [proof, null],
  ];
  for (const [p, who] of denied) {
    f.trace.length = 0;
    await assert.rejects(f.core.claim(p, who), e => e.code === 'forbidden');
    assert.ok(f.trace.every(q => !/xp_events|user_stats|user_profiles|ledger_candidate/.test(q.text)));
  }
  await f.db.query("update public.game_sessions set status='active' where id=$1", [room]);
  f.trace.length = 0;
  await assert.rejects(f.core.claim(proof, principal), e => e.code === 'not-complete');
  assert.ok(f.trace.every(q => !/xp_events|user_stats|user_profiles|ledger_candidate/.test(q.text)));
  await assertEmptyAward(f);
}));

test('ledger rechecks expiry after aggregate locks and rejects revoked/expired proof without writes', () => using(async f => {
  f.setAfterQuery(text => { if (text.includes('from public.user_stats')) f.setTime(50000); });
  await assert.rejects(f.core.claim(proof, principal), e => e.code === 'forbidden');
  await assertEmptyAward(f);
  f.setTime(1000); f.setAfterQuery(null);
  await f.db.query('update classroom_candidate_private.guest_sessions set revoked=true where player_id=$1', [alice]);
  await assert.rejects(f.core.claim(proof, principal), e => e.code === 'forbidden');
  await assertEmptyAward(f);
}));

test('ledger exact matching legacy event reconciles once without re-award or aggregate rewrite', () => using(async f => {
  await seedEvent(f); await seedStats(f, '9007199254740993', '31');
  const before = (await f.db.query('select updated_at from public.user_stats where user_id=$1', [account])).rows[0].updated_at;
  f.trace.length = 0;
  const result = await f.core.claim(proof, principal);
  assert.equal(result.disposition, 'reconciled');
  assert.equal(result.totalXp, '9007199254740993');
  assert.equal(result.awarded, 147);
  assert.ok(f.trace.every(q => !/^\s*(insert into public\.(xp_events|user_stats)|update public\.user_stats)/.test(q.text)));
  assert.deepEqual(await stats(f), { xp: '9007199254740993', coins: '31' });
  assert.deepEqual((await f.db.query('select updated_at from public.user_stats where user_id=$1', [account])).rows[0].updated_at, before);
  assert.equal((await f.core.claim(proof, principal)).disposition, 'replayed');
  assert.equal(await count(f, 'public.xp_events'), 1);
  assert.equal(await count(f, 'classroom_ledger_candidate_private.claims'), 1);
}));

test('ledger reconciliation refuses missing or unsafe aggregate instead of inventing a total', () => using(async f => {
  await seedEvent(f);
  await assert.rejects(f.core.claim(proof, principal), e => e.code === 'claim-reconciliation-required');
  for (const total of ['0', '146', '-1']) {
    await f.db.query('insert into public.user_stats(user_id,total_xp) values($1,$2::bigint) on conflict(user_id) do update set total_xp=excluded.total_xp', [account, total]);
    await assert.rejects(f.core.claim(proof, principal), e => ['claim-reconciliation-required', 'xp-total-unavailable'].includes(e.code));
  }
  assert.equal(await count(f, 'classroom_ledger_candidate_private.claims'), 0);
  assert.equal(await count(f, 'public.xp_events'), 1);
}));

test('ledger conflicting legacy account, amount, kind, subject and duplicate destinations fail closed', () => using(async f => {
  await seedStats(f, '1000');
  for (const patch of [{ userId: foreign }, { amount: 146 }, { kind: 'bonus_coin' }, { subject: 'biology' }, { subject: null }]) {
    await seedEvent(f, patch);
    await assert.rejects(f.core.claim(proof, principal), e => e.code === 'claim-reconciliation-required');
    await f.db.exec('truncate public.xp_events cascade');
  }
  await seedEvent(f); await seedEvent(f, { userId: foreign });
  await assert.rejects(f.core.claim(proof, principal), e => e.code === 'claim-reconciliation-required');
  assert.equal(await count(f, 'classroom_ledger_candidate_private.claims'), 0);
  assert.equal((await stats(f)).xp, '1000');
}));

test('ledger inconsistent existing marker, mutated event or changed score cannot be replayed or repaired silently', () => using(async f => {
  const event = await seedEvent(f); await seedStats(f, '1000');
  for (const patch of [{ awarded: 146 }, { user: foreign }, { subject: 'biology' }]) {
    await seedMarker(f, event, patch);
    await assert.rejects(f.core.claim(proof, principal), e => e.code === 'claim-reconciliation-required');
    await f.db.exec('truncate classroom_ledger_candidate_private.claims');
  }
  await seedMarker(f, event);
  await f.db.query('update public.game_players set score=148 where id=$1', [alice]);
  await assert.rejects(f.core.claim(proof, principal), e => e.code === 'claim-reconciliation-required');
  await f.db.query('update public.game_players set score=147 where id=$1', [alice]);
  await f.db.query("update public.xp_events set kind='bonus_coin' where id=$1", [event]);
  await assert.rejects(f.core.claim(proof, principal), e => e.code === 'claim-reconciliation-required');
  assert.equal((await stats(f)).xp, '1000');
}));

test('ledger all eight subject values are preserved and unsupported subjects map to null', () => using(async f => {
  const values = ['biology', 'chemistry', 'physics', 'maths', 'science', 'maths-standard', 'maths-advanced', 'maths-ext1', 'history', 'Physics', null];
  for (const subject of values) {
    await f.db.query('update public.game_sessions set subject=$1 where id=$2', [subject, room]);
    await f.core.claim(proof, principal);
    assert.equal((await f.db.query('select subject from public.xp_events')).rows[0].subject,
      values.slice(0,8).includes(subject) ? subject : null);
    await f.db.exec('truncate classroom_ledger_candidate_private.claims, public.xp_events, public.user_stats');
  }
}));

test('ledger negative score awards zero and existing coins stay unchanged', () => using(async f => {
  await f.db.query('update public.game_players set score=-2147483648 where id=$1', [alice]);
  await seedStats(f, '9007199254740993', '77');
  const result = await f.core.claim(proof, principal);
  assert.equal(result.awarded, 0);
  assert.equal(result.totalXp, '9007199254740993');
  assert.deepEqual(await stats(f), { xp: '9007199254740993', coins: '77' });
  assert.equal((await f.db.query('select amount from public.xp_events')).rows[0].amount, 0);
}));

test('ledger bigint transport preserves precision, replay returns current total, and overflow fails atomically', () => using(async f => {
  await seedStats(f, '9007199254740993', '9');
  assert.equal((await f.core.claim(proof, principal)).totalXp, '9007199254741140');
  await f.db.query('update public.user_stats set total_xp=total_xp+100 where user_id=$1', [account]);
  const replay = await f.core.claim(proof, principal);
  assert.equal(replay.totalXp, '9007199254741240');
  assert.equal(replay.awarded, 147);
  await f.db.exec('truncate classroom_ledger_candidate_private.claims, public.xp_events, public.user_stats');
  await seedStats(f, '9223372036854775807');
  await assert.rejects(f.core.claim(proof, principal), e => e.code === 'xp-total-unavailable');
  assert.equal(await count(f, 'public.xp_events'), 0);
  assert.equal(await count(f, 'classroom_ledger_candidate_private.claims'), 0);
  assert.equal((await stats(f)).xp, '9223372036854775807');
}));

test('ledger actual PostgreSQL stats failure rolls back new event and claim; clean retry awards once', () => using(async f => {
  await f.db.exec(`create function public.fail_stats() returns trigger language plpgsql as $$ begin raise exception 'injected stats failure'; end $$;
    create trigger test_stats_failure before insert or update on public.user_stats for each row execute function public.fail_stats();`);
  await assert.rejects(f.core.claim(proof, principal), /injected stats failure/);
  await assertEmptyAward(f);
  await f.db.exec('drop trigger test_stats_failure on public.user_stats');
  assert.equal((await f.core.claim(proof, principal)).disposition, 'awarded');
  assert.equal((await f.core.claim(proof, principal)).disposition, 'replayed');
  assert.equal((await stats(f)).xp, '147');
}));

test('ledger actual marker insert failure rolls back earlier event insert and leaves totals untouched', () => using(async f => {
  await seedStats(f, '20', '12');
  await f.db.exec(`create function public.fail_marker() returns trigger language plpgsql as $$ begin raise exception 'injected marker failure'; end $$;
    create trigger test_marker_failure before insert on classroom_ledger_candidate_private.claims for each row execute function public.fail_marker();`);
  await assert.rejects(f.core.claim(proof, principal), /injected marker failure/);
  assert.equal(await count(f, 'public.xp_events'), 0);
  assert.equal(await count(f, 'classroom_ledger_candidate_private.claims'), 0);
  assert.deepEqual(await stats(f), { xp: '20', coins: '12' });
}));

test('ledger two different players add to the same existing aggregate without clobbering one another', () => using(async f => {
  await seedStats(f, '1000', '11');
  const replies = await Promise.all([
    f.core.claim(proof, principal),
    f.core.claim({ sessionId: room, playerId: bob, secret: other }, principal),
  ]);
  assert.deepEqual(replies.map(r => r.awarded).sort((a,b) => a-b), [20,147]);
  assert.deepEqual(await stats(f), { xp: '1167', coins: '11' });
  assert.equal(await count(f, 'public.xp_events'), 2);
  assert.equal(await count(f, 'classroom_ledger_candidate_private.claims'), 2);
}));

test('ledger missing target profile fails closed and never creates a substitute identity', () => using(async f => {
  await f.db.query('delete from public.user_profiles where user_id=$1', [account]);
  await assert.rejects(f.core.claim(proof, principal), e => e.code === 'account-profile-unavailable');
  await assertEmptyAward(f);
  assert.equal((await f.db.query('select count(*)::int as n from public.user_profiles where user_id=$1', [account])).rows[0].n, 0);
}));

test('ledger query scope and lock order remain parameterized; unrelated ledger rows are not loaded', () => using(async f => {
  await seedEvent(f, { userId: foreign, reasonKey: 'unrelated:row', kind: 'bonus_coin', subject: null });
  await f.core.claim(proof, principal);
  const reads = f.trace.filter(q => /from (public|classroom_.*private)\./.test(q.text));
  assert.ok(reads.every(q => q.text.includes('where ')));
  assert.ok(f.trace.every(q => !q.text.includes(secret) && !q.text.includes(account) && !q.text.includes(reason)));
  const locks = reads.filter(q => /for (share|no key update|key share|update)/.test(q.text));
  assert.match(locks[0].text, /game_sessions/); assert.match(locks[1].text, /guest_sessions/);
  assert.match(locks[2].text, /game_players/); assert.match(locks[3].text, /ledger_candidate_private.claims/);
  assert.match(locks[4].text, /xp_events/); assert.match(locks[5].text, /user_profiles/);
  assert.match(locks[6].text, /user_stats/);
  assert.deepEqual(locks[4].params, [reason]);
}));

test('ledger fixture retains no production-ledger triggers and both browser roles remain denied', () => using(async f => {
  const triggers = (await f.db.query(`select count(*)::int as n from pg_trigger
    where tgrelid in ('public.xp_events'::regclass, 'public.user_stats'::regclass) and not tgisinternal`)).rows[0].n;
  assert.equal(triggers, 0);
  for (const role of ['anon', 'authenticated']) {
    const permissions = (await f.db.query(`select has_table_privilege($1,'public.xp_events','SELECT') as event_read,
      has_table_privilege($1,'public.user_stats','UPDATE') as stats_write,
      has_schema_privilege($1,'classroom_ledger_candidate_private','USAGE') as marker_usage`, [role])).rows[0];
    assert.deepEqual(permissions, { event_read: false, stats_write: false, marker_usage: false });
  }
}));
