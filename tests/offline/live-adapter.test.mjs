import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, pageHarness, elements, textContent, memoryStorage } from '../support/source-harness.mjs';
import { liveClientDouble } from '../support/live-client-double.mjs';
const live = loadSourceModule('lib/live.ts');

test('ACTUAL CLIENT WRAPPER: create_game sends existing parameter contract', async () => {
  const sb = liveClientDouble();
  const result = await live.createGame(sb, 'biology', 12, 10);
  assert.equal(result.code, 'LAB001');
  assert.deepEqual(sb.calls, [{ name: 'create_game', args: { p_subject: 'biology', p_year: 12, p_count: 10 } }]);
});
test('ACTUAL CLIENT WRAPPER: submit_answer forwards player, question and choice', async () => {
  const sb = liveClientDouble({ status: 'active' });
  const result = await live.submitAnswer(sb, 'synthetic-player-1', 0, 0);
  assert.equal(result.points, 100);
  assert.deepEqual(sb.calls, [{ name: 'submit_answer', args: { p_player_id: 'synthetic-player-1', p_index: 0, p_choice: 0 } }]);
});
test('ACTUAL CLIENT WRAPPER: permission errors reject, never count as success', async () => {
  const sb = { rpc: async () => ({ data: null, error: { message: 'permission denied' } }) };
  await assert.rejects(live.createGame(sb, 'biology', 12), /permission denied/);
  await assert.rejects(live.submitAnswer(sb, 'synthetic-player-1', 0, 0), /permission denied/);
});
test('HARNESS CONTROL: actual host create shows Start without a pre-start question row', async () => {
  const sb = liveClientDouble(); const rpc = sb.rpc; let preStartReads = 0;
  sb.rpc = (name, args) => {
    if (name === 'get_live_question') { preStartReads++; return Promise.resolve({ data: [], error: null }); }
    return rpc(name, args);
  };
  const harness = pageHarness('app/host/page.tsx', sb);
  try {
    let tree = await harness.render();
    const button = elements(tree).find((e) => e.type === 'button' && textContent(e) === 'Y11');
    assert.ok(button, 'host subject button exists');
    await button.props.onClick(); tree = await harness.render();
    assert.match(textContent(tree), /LAB001/);
    assert.match(textContent(tree), /Start game/);
    assert.equal(elements(tree).find((e) => e.type === 'button' && textContent(e) === 'Start game').props.disabled, false);
    assert.equal(preStartReads, 0);
  } finally { harness.unmount(); }
});
test('HARNESS CONTROL: player-read failure keeps the confirmed new lobby and offers a working retry', async () => {
  const sb = liveClientDouble(); const from = sb.from; const rpc = sb.rpc; let reads = 0; let questionReads = 0;
  sb.rpc = (name, args) => {
    if (name === 'get_live_question') { questionReads++; return Promise.resolve({ data: [], error: null }); }
    return rpc(name, args);
  };
  sb.from = (...args) => {
    const query = from(...args); const order = query.order.bind(query);
    return { select() { return this; }, eq() { return this; }, order() { return ++reads === 1 ? Promise.resolve({ data: null, error: { message: 'temporary player read failure' } }) : order(); } };
  };
  const harness = pageHarness('app/host/page.tsx', sb);
  try {
    const setup = await harness.render();
    await elements(setup).find((e) => e.type === 'button' && textContent(e) === 'Y11').props.onClick();
    let tree = await harness.render();
    assert.match(textContent(tree), /LAB001/); assert.match(textContent(tree), /created lobby is kept/);
    const retry = elements(tree).find((e) => e.type === 'button' && textContent(e) === 'Retry players');
    assert.ok(retry && !retry.props.disabled); await retry.props.onClick(); tree = await harness.render();
    assert.doesNotMatch(textContent(tree), /temporary player read failure/);
    assert.equal(elements(tree).find((e) => e.type === 'button' && textContent(e) === 'Start game').props.disabled, false);
    assert.equal(questionReads, 0);
  } finally { harness.unmount(); }
});

test('HARNESS CONTROL: actual student first answer reaches a receipt before reload', async () => {
  const storage = memoryStorage();
  storage.setItem('legends_arena_live', JSON.stringify({ code: 'LAB001', room: 'synthetic-room-1', player: 'synthetic-player-1', alias: 'Test Finch', ts: Date.now() }));
  const sb = liveClientDouble({ status: 'active' });
  const harness = pageHarness('app/join/page.tsx', sb, storage);
  try {
    const initial = await harness.render();
    const rejoin = elements(initial).find((e) => e.type === 'button' && /Rejoin game/.test(textContent(e)));
    assert.ok(rejoin, 'player recovery button exists');
    await rejoin.props.onClick();
    const question = await harness.render();
    const answer = elements(question).find((e) => e.type === 'AnswerTile' && e.props.index === 0);
    assert.ok(answer && !answer.props.disabled, 'unanswered question offers an enabled answer');
    await answer.props.onClick();
    assert.equal(sb.state.receipt.is_correct, true);
    assert.match(textContent(await harness.render()), /Correct!/);
    assert.equal(sb.calls.filter((c) => c.name === 'submit_answer').length, 1);
  } finally { harness.unmount(); }
});
