import test from 'node:test';
import assert from 'node:assert/strict';
import { pageHarness, elements, textContent, memoryStorage } from '../support/source-harness.mjs';
import { liveClientDouble } from '../support/live-client-double.mjs';

const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const stateRow = (index = 0) => ({ data: [{ status: 'active', index, total: 2, stem: 'Synthetic question', options: ['First', 'Second'], question_started_at: '2026-01-01T00:00:00Z', per_question_seconds: 15, is_double: false }], error: null });
const storedStudent = (storage) => storage.setItem('legends_arena_live', JSON.stringify({ code: 'LAB001', room: 'synthetic-room-1', player: 'synthetic-player-1', alias: 'Test Finch', ts: Date.now() }));
function connect(tree, operation) {
  return operation === 'join' ? elements(tree).find((e) => e.type === 'form').props.onSubmit({ preventDefault() {} })
    : elements(tree).find((e) => e.type === 'button' && /Rejoin game/.test(textContent(e))).props.onClick();
}
async function form(harness) {
  let tree = await harness.render();
  const inputs = elements(tree).filter((e) => e.type === 'input');
  inputs[0].props.onChange({ target: { value: 'LAB001' } });
  inputs[1].props.onChange({ target: { value: 'Test Finch' } });
  tree = await harness.render();
  return tree;
}
function setup(auth = { user: null, loading: false }) {
  const storage = memoryStorage(); storedStudent(storage);
  const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc;
  const initial = defer(); const newer = defer(); let reads = 0;
  sb.rpc = (name, args) => {
    if (name === 'get_live_question') {
      reads++;
      if (reads === 1) return initial.promise;
      if (reads === 2) return newer.promise;
    }
    return rpc(name, args);
  };
  return { storage, sb, rpc, initial, newer, auth, harness: pageHarness('app/join/page.tsx', sb, storage, auth) };
}
function fail(request, kind) {
  if (kind === 'unavailable') request.resolve({ data: [], error: null });
  else request.reject(new Error('newest state read failed'));
}
function finishOld(request, outcome) {
  if (outcome === 'error') request.reject(new Error('obsolete initial failure'));
  else request.resolve(stateRow());
}

test('ACTUAL STUDENT: newer state failure releases join/rejoin controls and permits a normal retry', async () => {
  for (const operation of ['join', 'rejoin']) for (const failure of ['rejected', 'unavailable']) for (const outcome of ['success', 'error']) {
    const { harness, sb, initial, newer } = setup();
    try {
      const pending = connect(await form(harness), operation);
      await settle(); sb.emit('game_sessions'); await settle(); fail(newer, failure); await settle();
      let tree = await harness.render();
      assert.match(textContent(tree), failure === 'unavailable' ? /Game state is unavailable/ : /newest state read failed/);
      assert.ok(elements(tree).filter((e) => e.type === 'button').every((e) => !e.props.disabled), `${operation}/${failure}: retry controls must be enabled`);
      const before = textContent(tree);
      finishOld(initial, outcome); await pending; tree = await harness.render();
      assert.equal(textContent(tree), before, `${operation}/${failure}/${outcome}: stale initial completion cannot alter the error state`);
      await connect(tree, operation); tree = await harness.render();
      assert.match(textContent(tree), /Question 1\/2/);
      assert.doesNotMatch(textContent(tree), /newest state read failed|Game state is unavailable/);
      assert.ok(elements(tree).filter((e) => e.type === 'AnswerTile').every((e) => !e.props.disabled));
    } finally { harness.unmount(); }
  }
});

test('ACTUAL STUDENT: a replacement connection owns busy after the failed read releases the old one', async () => {
  for (const operation of ['join', 'rejoin']) for (const outcome of ['success', 'error']) {
    const { harness, sb, initial, newer } = setup(); const replacement = defer(); let blockReplacement = false;
    const rpc = sb.rpc;
    sb.rpc = (name, args) => blockReplacement && name === (operation === 'join' ? 'join_game' : 'live_rejoin') ? replacement.promise : rpc(name, args);
    try {
      const pending = connect(await form(harness), operation);
      await settle(); sb.emit('game_sessions'); await settle(); fail(newer, 'rejected'); await settle();
      const retryTree = await harness.render();
      assert.ok(elements(retryTree).filter((e) => e.type === 'button').every((e) => !e.props.disabled));
      blockReplacement = true; const retry = connect(retryTree, operation); await settle();
      finishOld(initial, outcome); await pending;
      let tree = await harness.render();
      assert.ok(elements(tree).filter((e) => e.type === 'button').every((e) => e.props.disabled), 'old completion must not release the new connection lock');
      assert.doesNotMatch(textContent(tree), /obsolete initial failure/);
      replacement.resolve({ data: [{ session_id: 'replacement-room', player_id: 'replacement-player', status: 'active' }], error: null }); await retry;
      tree = await harness.render(); assert.match(textContent(tree), /Question 1\/2/);
    } finally { harness.unmount(); }
  }
});

test('ACTUAL STUDENT: state-read failure cannot release an answer that is already in flight', async () => {
  const storage = memoryStorage(); storedStudent(storage); const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc;
  const answer = defer(); let rejectReads = false;
  sb.rpc = (name, args) => name === 'submit_answer' ? answer.promise
    : name === 'get_live_question' && rejectReads ? Promise.reject(new Error('current refresh failed')) : rpc(name, args);
  const harness = pageHarness('app/join/page.tsx', sb, storage);
  try {
    await connect(await form(harness), 'rejoin'); let tree = await harness.render();
    const pending = elements(tree).find((e) => e.type === 'AnswerTile').props.onClick();
    rejectReads = true; sb.emit('game_sessions'); await settle(); tree = await harness.render();
    assert.match(textContent(tree), /current refresh failed/);
    assert.ok(elements(tree).filter((e) => e.type === 'AnswerTile').every((e) => e.props.disabled));
    answer.resolve({ data: [{ is_correct: true, correct_index: 0, points: 100 }], error: null }); await pending;
    assert.match(textContent(await harness.render()), /Correct!/);
  } finally { harness.unmount(); }
});

test('ACTUAL STUDENT: newest read failures after account replacement or unmount stay obsolete', async () => {
  for (const operation of ['join', 'rejoin']) for (const change of ['switch', 'unmount']) for (const outcome of ['success', 'error']) {
    const auth = { user: { id: 'student-A' }, loading: false };
    const { harness, sb, initial, newer } = setup(auth);
    try {
      const pending = connect(await form(harness), operation);
      await settle(); sb.emit('game_sessions'); await settle();
      if (change === 'switch') { auth.user = { id: 'student-B' }; await harness.render(); } else harness.unmount();
      const before = textContent(await harness.render());
      fail(newer, 'rejected'); await settle(); finishOld(initial, outcome); await pending;
      assert.equal(textContent(await harness.render()), before, `${operation}/${change}/${outcome}`);
    } finally { harness.unmount(); }
  }
});
