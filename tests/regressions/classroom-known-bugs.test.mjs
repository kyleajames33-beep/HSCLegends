import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, pageHarness, elements, textContent, memoryStorage } from '../support/source-harness.mjs';
import { liveClientDouble } from '../support/live-client-double.mjs';

// Real source regressions. The first two have local fixes; the uncached
// server-receipt requirement remains RED. Do not skip or invert that failure.
test('FIXED LOCALLY: late join must not reassign existing teams', () => {
  const { assignProjectorTeams } = loadSourceModule('lib/live-session-cache.ts');
  const players = ['b', 'd', 'f'].map((id) => ({ id, alias: `Test ${id}`, score: 0 }));
  const before = assignProjectorTeams({}, players);
  const after = assignProjectorTeams(before, [...players, { id: 'a', alias: 'Late Test', score: 0 }]);
  for (const player of players) assert.equal(after[player.id], before[player.id], `team changed for ${player.alias}`);
});

test('FIXED LOCALLY: active-room host reload must recover the existing room controls', async () => {
  const sb = liveClientDouble();
  const storage = memoryStorage();
  const original = pageHarness('app/host/page.tsx', sb, storage);
  let reloaded;
  try {
    const setup = await original.render();
    const create = elements(setup).find((e) => e.type === 'button' && textContent(e) === 'Y11');
    assert.ok(create, 'setup button exists');
    await create.props.onClick();
    assert.match(textContent(await original.render()), /LAB001/, 'room exists before reload');
    sb.state.status = 'active';
    original.unmount();
    reloaded = pageHarness('app/host/page.tsx', sb, storage);
    const saved = await reloaded.render();
    const resume = elements(saved).find((e) => e.type === 'button' && textContent(e) === 'Resume game');
    assert.ok(resume && !resume.props.disabled, 'same-account resume is offered');
    await resume.props.onClick();
    const restored = await reloaded.render();
    const reads = sb.calls.filter((c) => c.name === 'get_live_question');
    assert.deepEqual(reads, [{ name: 'get_live_question', args: { p_session_id: 'synthetic-room-1' } }], 'restore must read the original created room, not create a replacement');
    assert.match(textContent(restored), /Next/, 'active-room controls restored from the server fixture');
    assert.equal(sb.calls.filter((c) => c.name === 'create_game').length, 1, 'resume must not create another room');
  } finally { original.unmount(); reloaded?.unmount(); }
});

test('KNOWN PRODUCT BUG: student rejoin must restore the current answer receipt', async () => {
  const storage = memoryStorage();
  storage.setItem('legends_arena_live', JSON.stringify({ code: 'LAB001', room: 'synthetic-room-1', player: 'synthetic-player-1', alias: 'Test Finch', ts: Date.now() }));
  const sb = liveClientDouble({ status: 'active', receipt: { is_correct: true, correct_index: 0, points: 100 } });
  const reloaded = pageHarness('app/join/page.tsx', sb, storage);
  try {
    const start = await reloaded.render();
    const rejoin = elements(start).find((e) => e.type === 'button' && /Rejoin game/.test(textContent(e)));
    assert.ok(rejoin, 'same-browser player identity was recovered');
    await rejoin.props.onClick();
    const resumed = await reloaded.render();
    assert.ok(sb.calls.some((c) => c.name === 'live_rejoin'), 'actual rejoin wrapper called');
    assert.match(textContent(resumed), /Correct!/, 'answered question came back without its receipt');
    assert.equal(elements(resumed).filter((e) => e.type === 'AnswerTile' && !e.props.disabled).length, 0, 'already answered question must not offer another submission');
  } finally { reloaded.unmount(); }
});
