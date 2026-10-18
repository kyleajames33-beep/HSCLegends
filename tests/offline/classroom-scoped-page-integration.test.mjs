import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createScopedClassroomService } from '../../lib/classroom-server/scoped-adapter.mjs';
import { hashSessionSecret, sealSessionQuestions } from '../../lib/classroom-server/classroom-core.mjs';
import { pageHarness, textContent, elements } from '../support/classroom-candidate-harness.mjs';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const room = id(1), player = id(2), host = id(3), peer = id(4);
const secret = 'PUBLIC-SYNTHETIC-PAGE-PGLITE-PROOF-00000000';
const button = (tree, text) => elements(tree).find(e => e.type === 'button' && textContent(e).includes(text));
async function restore(h) { await button(await h.render(), 'Reconnect my game').props.onClick(); return h.render(); }

async function fixture({ sealed = true } = {}) {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('../fixtures/classroom-candidate-schema.sql', import.meta.url), 'utf8'));
  const set = sealSessionQuestions([{ stem: 'Actual scoped adapter question', options: ['Frozen yes', 'Frozen no'], correctIndex: 0, revision: 'scope-v1' }]);
  await db.query('insert into auth.users values ($1)', [host]);
  await db.query("insert into public.game_sessions values ($1, $2, 'active', 0, to_timestamp(0), 15, to_timestamp(100), null)", [room, host]);
  if (sealed) await db.query('insert into classroom_candidate_private.question_sets values ($1, $2::json)', [room, JSON.stringify(set)]);
  await db.query("insert into public.game_players values ($1, $2, null, 'Synthetic guest', 0), ($3, $2, null, 'Private peer alias', 200)", [player, room, peer]);
  await db.query('insert into classroom_candidate_private.guest_sessions values ($1, $2, $3, to_timestamp(50), false)', [player, room, hashSessionSecret(secret)]);
  const trace = [];
  const runTransaction = fn => db.transaction(async tx => {
    await tx.query('set transaction isolation level serializable');
    return fn({ query: async (text, params = []) => {
      trace.push(text);
      // Deterministic fixture clock only; real service calls clock_timestamp().
      return text.includes('clock_timestamp()') ? tx.query('select 1000::bigint as now_ms') : tx.query(text, params);
    } });
  });
  const service = createScopedClassroomService({ runTransaction });
  const proof = { sessionId: room, playerId: player, secret };
  const binding = { sessionId: room, playerId: player, principalId: null };
  let loseAck = false;
  // Test-only transport wrapper. No endpoint, cookies, hosted auth or grant
  // issuance is implemented. principalId is the known synthetic fixture user.
  const transport = {
    enabled: true,
    restore: async () => ({ ...binding }),
    join: async () => { throw new Error('guest issuance deliberately unimplemented'); },
    ownSnapshot: async () => ({ ...await service.ownSnapshot(proof), principalId: null }),
    submit: async (_binding, answer) => {
      const ownReceipt = await service.submit(proof, answer);
      if (loseAck) throw new Error('synthetic lost acknowledgement');
      return { schemaVersion: 1, ...binding, ownReceipt };
    },
    ownStanding: async () => ({ schemaVersion: 1, ...binding, ...await service.ownStanding(proof) }),
  };
  return { db, trace, service, proof, transport, loseAck: () => { loseAck = true; } };
}

test('ACTUAL JOIN → SCOPED PGLITE: lost acknowledgement, uncached remount and own final standing', async () => {
  const f = await fixture(); let h = pageHarness(f.transport);
  try {
    let tree = await restore(h); assert.match(textContent(tree), /Actual scoped adapter question/);
    f.loseAck(); await elements(tree).find(e => e.type === 'AnswerTile' && e.props.index === 0).props.onClick();
    tree = await h.render(); assert.match(textContent(tree), /Correct!/); assert.match(textContent(tree), /147 points recorded/);
    assert.equal((await f.db.query('select count(*)::int as n from public.game_answers')).rows[0].n, 1);
    assert.equal((await f.db.query('select count(*)::int as n from classroom_candidate_private.receipts')).rows[0].n, 1);
    h.unmount(); h = pageHarness(f.transport); f.trace.length = 0;
    tree = await restore(h); assert.match(textContent(tree), /accepted choice: Frozen yes/);
    assert.ok(f.trace.every(sql => !/^\s*(insert|update|delete)\b/i.test(sql)), 'recovery is read-only');
    assert.ok(f.trace.every(sql => !/select\s+\*/i.test(sql)), 'scoped queries only');
    assert.doesNotMatch(textContent(tree), /Private peer alias/);
    await f.db.query("update public.game_sessions set status = 'complete', current_index = 1 where id = $1", [room]);
    await button(tree, 'Refresh game state').props.onClick(); tree = await h.render();
    assert.match(textContent(tree), /#2/); assert.match(textContent(tree), /147 pts/); assert.match(textContent(tree), /No XP claim has been sent or confirmed/);
    assert.equal((await f.db.query('select count(*)::int as n from classroom_candidate_private.claims')).rows[0].n, 0);
    assert.equal((await f.db.query('select count(*)::int as n from classroom_candidate_private.test_xp')).rows[0].n, 0);
  } finally { h.unmount(); await f.db.close(); }
});

test('ACTUAL JOIN → SCOPED PGLITE: legacy answer with no receipt key or question set renders safely', async () => {
  const f = await fixture({ sealed: false }); const h = pageHarness(f.transport);
  try {
    await f.db.query('insert into public.game_answers(session_id,player_id,question_index,choice,is_correct,points,answered_at) values ($1,$2,0,1,false,0,to_timestamp(1))', [room, player]);
    const tree = await restore(h); assert.match(textContent(tree), /Historical question content is unavailable/);
    assert.doesNotMatch(textContent(tree), /Frozen yes|Frozen no|Not quite|Correct!/); assert.equal(button(tree, 'Try again, unscored'), undefined);
  } finally { h.unmount(); await f.db.close(); }
});

test('ACTUAL JOIN → SCOPED PGLITE: revoked grant fails closed without alias fallback', async () => {
  const f = await fixture(); const h = pageHarness(f.transport);
  try {
    await f.db.query('update classroom_candidate_private.guest_sessions set revoked = true where player_id = $1', [player]);
    const tree = await restore(h); assert.match(textContent(tree), /could not be confirmed/);
    assert.equal(elements(tree).filter(e => e.type === 'AnswerTile').length, 0);
    assert.ok(f.trace.every(sql => !sql.includes('from public.game_answers')));
    assert.ok(f.trace.every(sql => !sql.includes('from public.game_players')));
  } finally { h.unmount(); await f.db.close(); }
});
