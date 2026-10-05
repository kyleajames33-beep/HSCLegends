import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, pageHarness, elements, textContent, memoryStorage } from '../support/source-harness.mjs';
import { liveClientDouble } from '../support/live-client-double.mjs';

const learning = loadSourceModule('lib/classroom-learning.ts');
const live = loadSourceModule('lib/live.ts');
const presence = loadSourceModule('lib/presence.ts');
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const button = (tree, text) => elements(tree).find((node) => node.type === 'button' && textContent(node) === text);
const click = async (page, text) => {
  const target = button(await page.render(), text); assert.ok(target, text);
  await target.props.onClick(); await settle(); return page.render();
};
const storeStudent = (storage) => storage.setItem('legends_arena_live', JSON.stringify({ code: 'LAB001', room: 'synthetic-room-1', player: 'synthetic-player-1', alias: 'Test Finch', ts: Date.now() }));
async function resume(page) {
  const tree = await page.render(); const target = elements(tree).find((node) => node.type === 'button' && /Rejoin game/.test(textContent(node)));
  assert.ok(target); await target.props.onClick(); return page.render();
}
function scheduler() {
  let id = 0; const intervals = new Map(); const timeouts = new Map();
  return {
    setInterval(fn) { intervals.set(++id, fn); return id; }, clearInterval(key) { intervals.delete(key); },
    setTimeout(fn) { timeouts.set(++id, fn); return id; }, clearTimeout(key) { timeouts.delete(key); },
    tick() { for (const fn of [...intervals.values()]) fn(); },
    runTimeouts() { const work = [...timeouts.values()]; timeouts.clear(); for (const fn of work) fn(); },
    pendingTimeouts: () => timeouts.size,
  };
}

test('ACTUAL STUDENT: missing final player keeps recovery and retries without rank zero or an XP claim', async () => {
  const storage = memoryStorage(); storeStudent(storage);
  const sb = liveClientDouble({ status: 'active', players: [] });
  const page = pageHarness('app/join/page.tsx', sb, storage);
  try {
    await resume(page); sb.state.status = 'complete'; sb.emit('game_sessions'); await settle();
    const tree = await page.render();
    assert.match(textContent(tree), /final score is not available/);
    assert.doesNotMatch(textContent(tree), /#0|GAME OVER|Saved!/);
    assert.ok(storage.getItem('legends_arena_live'));
    assert.equal(sb.calls.filter((c) => c.name === 'claim_game_xp').length, 0);
    sb.state.players = [{ id: 'synthetic-player-1', alias: 'Test Finch', score: 100 }];
    const completed = await click(page, 'Retry loading results');
    assert.match(textContent(completed), /#1/); assert.match(textContent(completed), /100 pts/);
    assert.equal(storage.getItem('legends_arena_live'), null);
  } finally { page.unmount(); }
});

test('ACTUAL STUDENT: tied server scores share rank, regardless of roster ordering', () => {
  const rows = [{ id: 'a', score: 100 }, { id: 'b', score: 150 }, { id: 'c', score: 100 }];
  assert.equal(learning.finalStanding(rows, 'a').rank, 2); assert.equal(learning.finalStanding(rows, 'c').rank, 2);
  assert.throws(() => learning.finalStanding([], 'missing'), /not available/);
  assert.throws(() => learning.finalStanding([{ id: 'a', score: NaN }], 'a'), /not available/);
});

test('ACTUAL STUDENT: acknowledged and obsolete answer handlers cannot send another mutation', async () => {
  const storage = memoryStorage(); storeStudent(storage); const sb = liveClientDouble({ status: 'active' });
  const page = pageHarness('app/join/page.tsx', sb, storage);
  try {
    const tree = await resume(page); const answer = elements(tree).find((node) => node.type === 'AnswerTile');
    await answer.props.onClick(); await answer.props.onClick();
    assert.equal(sb.calls.filter((c) => c.name === 'submit_answer').length, 1);
    sb.state.status = 'complete'; sb.emit('game_sessions'); await settle(); await page.render();
    await answer.props.onClick(); assert.equal(sb.calls.filter((c) => c.name === 'submit_answer').length, 1);
  } finally { page.unmount(); }
});

test('ACTUAL RECEIPT CHECK: malformed, out-of-bounds and contradictory acknowledgements fail visibly', () => {
  for (const receipt of [null, {}, { is_correct: false, correct_index: 0, points: 10 }, { is_correct: true, correct_index: 4, points: 10 }, { is_correct: true, correct_index: 0, points: NaN }, { is_correct: true, correct_index: 0, points: -1 }]) {
    assert.throws(() => learning.checkedReceipt(receipt, 0, 4), /could not be confirmed/);
  }
  assert.equal(learning.checkedReceipt({ is_correct: true, correct_index: 0, points: 100 }, 0, 4).points, 100);
});

test('ACTUAL STUDENT: lobby catch-up shows failures and recovers a missed session update', async () => {
  const storage = memoryStorage(); storeStudent(storage); const sb = liveClientDouble(); const rpc = sb.rpc;
  const page = pageHarness('app/join/page.tsx', sb, storage);
  try {
    await resume(page);
    sb.rpc = (name, args) => name === 'get_live_question' ? Promise.resolve({ data: null, error: { message: 'Synthetic status failure' } }) : rpc(name, args);
    assert.match(textContent(await click(page, 'Refresh game state')), /Synthetic status failure/);
    sb.rpc = rpc; sb.state.status = 'active'; // Deliberately emit no Realtime event.
    assert.match(textContent(await click(page, 'Refresh game state')), /Question 1\/2/);
  } finally { page.unmount(); }
});

test('ACTUAL STUDENT: unscored retry uses only the acknowledged key and never resubmits or changes points', async () => {
  const storage = memoryStorage(); storeStudent(storage); const sb = liveClientDouble({ status: 'active' });
  const page = pageHarness('app/join/page.tsx', sb, storage);
  try {
    const tree = await resume(page); await elements(tree).find((node) => node.type === 'AnswerTile' && node.props.index === 1).props.onClick();
    assert.match(textContent(await page.render()), /does not supply an explanation yet/);
    const practice = await click(page, 'Try again, unscored');
    assert.match(textContent(practice), /no extra points/);
    await click(page, 'Nucleus');
    assert.match(textContent(await page.render()), /That matches the answer. No score changed/);
    assert.equal(sb.calls.filter((c) => c.name === 'submit_answer').length, 1); assert.equal(sb.state.players[0].score, 0);
    sb.state.status = 'complete'; sb.emit('game_sessions'); await settle();
    assert.doesNotMatch(textContent(await page.render()), /Learning check/);
  } finally { page.unmount(); }
});

test('ACTUAL STUDENT: larger text is a local reading control and does not change the clock or submit answers', async () => {
  const storage = memoryStorage(); storeStudent(storage); const sb = liveClientDouble({ status: 'active' });
  const page = pageHarness('app/join/page.tsx', sb, storage);
  try {
    await resume(page); const before = sb.calls.length;
    const tree = await click(page, 'Larger text');
    assert.ok(elements(tree).find((node) => node.type === 'h2' && /text-3xl/.test(node.props.className)));
    assert.match(textContent(tree), /15s/); assert.equal(sb.calls.length, before);
  } finally { page.unmount(); }
});

test('ACTUAL TELEMETRY: RPC errors, missing counts and impossible counts cannot become a false all-in or empty presence', async () => {
  for (const response of [{ data: null, error: { message: 'denied' } }, { data: [], error: null }, { data: [{ answered: 2, total: 2, correct: 3 }], error: null }]) {
    await assert.rejects(live.liveAnswerCount({ rpc: async () => response }, 'fixture', 0));
  }
  const counts = await live.liveAnswerCount({ rpc: async () => ({ data: [{ answered: 3, total: 2, correct: 1 }], error: null }) }, 'fixture', 0);
  assert.equal(counts.answered, 3, 'disconnected answerers remain in the numerator');
  await assert.rejects(presence.arenaPresences({ rpc: async () => ({ data: null, error: { message: 'denied' } }) }, 'fixture'), /denied/);
  assert.equal((await presence.arenaPresences({ rpc: async () => ({ data: [], error: null }) }, 'fixture')).size, 0);
});

async function startHost(sb, options = {}) {
  const page = pageHarness('app/host/page.tsx', sb, memoryStorage(), { user: { id: 'synthetic-host-1' }, loading: false }, options);
  const tree = await page.render(); const create = elements(tree).find((node) => node.type === 'button' && textContent(node) === 'Y12');
  await create.props.onClick(); await page.render(); await click(page, 'Start game'); return page;
}

test('ACTUAL HOST: teacher pacing defaults off for automatic advance and cancels a pending automatic step', async () => {
  const sb = liveClientDouble(); const rpc = sb.rpc; let advances = 0;
  sb.rpc = (name, args) => name === 'next_question' ? (advances++, Promise.resolve({ data: null, error: null })) : rpc(name, args);
  const timers = scheduler(); const page = await startHost(sb, { scheduler: timers, countdown: { remaining: 0, expired: true, frac: 0 } });
  try {
    assert.equal(timers.pendingTimeouts(), 0); assert.equal(advances, 0);
    assert.match(textContent(await page.render()), /does not pause or extend answer time/);
    await click(page, 'Enable automatic advance'); assert.equal(timers.pendingTimeouts(), 1);
    await click(page, 'Switch to teacher-paced'); assert.equal(timers.pendingTimeouts(), 0);
    timers.runTimeouts(); await settle(); assert.equal(advances, 0);
    await click(page, 'Enable automatic advance'); timers.runTimeouts(); await settle(); await page.render(); assert.equal(advances, 1);
    await click(page, 'Switch to teacher-paced'); await click(page, 'Enable automatic advance'); timers.runTimeouts(); await settle(); assert.equal(advances, 1);
  } finally { page.unmount(); }
});

test('ACTUAL HOST: hide names removes aliases from the visible scoreboard and avatar seeds', async () => {
  const sb = liveClientDouble(); const page = await startHost(sb);
  try {
    assert.match(textContent(await page.render()), /Test Finch/);
    const tree = await click(page, 'Hide student names'); assert.doesNotMatch(textContent(tree), /Test Finch/);
    assert.ok(elements(tree).filter((node) => node.type === 'Avatar').every((node) => node.props.seed !== 'Test Finch'));
    assert.match(textContent(await click(page, 'Show student names')), /Test Finch/);
  } finally { page.unmount(); }
});

test('ACTUAL HOST: observed summary never infers missing answers from the different presence population', async () => {
  const sb = liveClientDouble(); const timers = scheduler(); const page = await startHost(sb, { scheduler: timers });
  try {
    await settle(); await page.render(); sb.state.status = 'complete'; sb.emit('game_sessions'); await settle();
    const text = textContent(await page.render());
    assert.match(text, /Last counts observed/); assert.match(text, /not a final assessment/);
    assert.match(text, /0\/0 correct among observed answers/); assert.match(text, /1 recently present/); assert.doesNotMatch(text, /not yet answered|all in!/);
    assert.match(text, /No incorrect answer was observed/);
  } finally { page.unmount(); }
});

test('ACTUAL SUMMARY: stale or foreign-room observations cannot be merged into the current room', () => {
  const row = { sessionId: 'one', index: 0, stem: 'Fixture', answered: 1, total: 2, correct: 0, observedAt: 2 };
  const initial = learning.recordObservation([], row);
  assert.equal(learning.recordObservation(initial, { ...row, observedAt: 1, correct: 1 })[0].correct, 0);
  assert.equal(learning.recordObservation(initial, { ...row, sessionId: 'two' }).length, 1);
  assert.equal(learning.recordObservation(initial, { ...row, correct: 3 }), initial);
});


test('ACTUAL HOST: received answers above recent presence remain visible without an all-in claim', async () => {
  const sb = liveClientDouble(); const rpc = sb.rpc;
  sb.rpc = (name, args) => name === 'live_answer_count' ? Promise.resolve({ data: [{ answered: 3, total: 1, correct: 2 }], error: null }) : rpc(name, args);
  const page = await startHost(sb);
  try {
    const text = textContent(await page.render());
    assert.match(text, /3 answers · 1 recently present/); assert.doesNotMatch(text, /all in!/);
  } finally { page.unmount(); }
});

test('ACTUAL HOST: equal scores receive the same displayed rank', async () => {
  const sb = liveClientDouble({ players: [{ id: 'a', alias: 'Guest A', score: 100 }, { id: 'b', alias: 'Guest B', score: 100 }] });
  const page = await startHost(sb);
  try {
    const rows = elements(await page.render()).filter((node) => node.type === 'li');
    assert.equal(rows.length, 2);
    for (const row of rows) assert.match(textContent(row), /^1\./);
  } finally { page.unmount(); }
});
