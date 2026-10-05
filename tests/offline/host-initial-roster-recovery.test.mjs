import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, pageHarness, elements, textContent, memoryStorage } from '../support/source-harness.mjs';
import { liveClientDouble } from '../support/live-client-double.mjs';

const cache = loadSourceModule('lib/live-session-cache.ts');
const { LiveHostController } = loadSourceModule('lib/live-host-controller.ts', { './live': loadSourceModule('lib/live.ts'), './live-session-cache': cache });
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const player = (id = 'arriving-player') => ({ id, alias: 'Synthetic Arrival', score: 0 });
function delayedInitialRoster() {
  const sb = liveClientDouble({ players: [] }); const from = sb.from; const first = defer();
  let reads = 0; let subscriptions = 0; let removals = 0;
  const channel = sb.channel; const remove = sb.removeChannel;
  sb.channel = (...args) => { subscriptions++; return channel(...args); };
  sb.removeChannel = (...args) => { removals++; return remove(...args); };
  sb.from = (...args) => {
    const query = from(...args);
    return { select() { return this; }, eq() { return this; }, order() { return ++reads === 1 ? first.promise : query.order(); } };
  };
  return { sb, first, reads: () => reads, subscriptions: () => subscriptions, removals: () => removals };
}
function finishInitial(first, outcome) {
  if (outcome === 'error') first.reject(new Error('obsolete initial roster failure'));
  else first.resolve({ data: [], error: null });
}

test('ACTUAL HOST PAGE: a join during the initial roster read reaches the lobby and enables Start', async () => {
  for (const outcome of ['success', 'error']) {
    const { sb, first, reads } = delayedInitialRoster();
    const harness = pageHarness('app/host/page.tsx', sb);
    try {
      const setup = await harness.render();
      const creating = elements(setup).find((e) => e.type === 'button' && textContent(e) === 'Y11').props.onClick();
      await settle();
      sb.state.players.push(player()); sb.emit('game_players'); await settle();
      finishInitial(first, outcome); await creating;
      const lobby = await harness.render();
      assert.match(textContent(lobby), /Synthetic Arrival/);
      const start = elements(lobby).find((e) => e.type === 'button' && textContent(e) === 'Start game');
      assert.ok(start && !start.props.disabled, 'the arriving player must enable Start without another mutation or reload');
      assert.doesNotMatch(textContent(lobby), /obsolete initial roster failure/);
      assert.ok(reads() >= 2, 'the event must trigger an authoritative roster read');
    } finally { harness.unmount(); }
  }
});

test('ACTUAL HOST: duplicate roster events and stale responses preserve the newest roster and teams', async () => {
  const sb = liveClientDouble({ players: [] }); const first = defer(); const olderEvent = defer(); let reads = 0;
  sb.from = () => ({ select() { return this; }, eq() { return this; }, order() {
    reads++;
    if (reads === 1) return first.promise;
    if (reads === 2) return olderEvent.promise;
    return Promise.resolve({ data: sb.state.players.map((p) => ({ ...p })), error: null });
  } });
  const controller = new LiveHostController(sb, memoryStorage()); controller.setAccount('synthetic-host', false);
  const creating = controller.create('biology', 12); await settle();
  sb.state.players.push(player('first-arrival')); sb.emit('game_players'); await settle();
  sb.state.players.push(player('second-arrival')); sb.emit('game_players'); await settle();
  assert.equal(controller.getSnapshot().players.length, 2);
  const teams = JSON.stringify(controller.getSnapshot().teams);
  olderEvent.resolve({ data: [player('first-arrival')], error: null }); await settle();
  first.resolve({ data: [], error: null }); await creating;
  sb.emit('game_players'); await settle();
  assert.equal(controller.getSnapshot().players.length, 2);
  assert.equal(JSON.stringify(controller.getSnapshot().teams), teams);
  assert.equal(controller.getSnapshot().err, '');
  controller.dispose();
});

test('ACTUAL HOST: creation subscriptions and late initial reads cannot affect a new room, account or unmounted host', async () => {
  for (const change of ['new-room', 'switch', 'dispose']) for (const outcome of ['success', 'error']) {
    const { sb, first, subscriptions, removals } = delayedInitialRoster();
    const storage = memoryStorage(); const controller = new LiveHostController(sb, storage); controller.setAccount('synthetic-host', false);
    const creating = controller.create('biology', 12); await settle();
    assert.equal(subscriptions(), 1, 'initial subscription must exist before the first roster response');
    if (change === 'new-room') {
      const rpc = sb.rpc;
      sb.rpc = (name, args) => name === 'create_game' ? Promise.resolve({ data: [{ session_id: 'replacement-room', code: 'NEW001' }], error: null }) : rpc(name, args);
      sb.state.players = [player('replacement-player')]; await controller.create('chemistry', 11);
    } else if (change === 'switch') controller.setAccount('different-owner', false);
    else controller.dispose();
    assert.ok(removals() >= 1, 'obsolete subscription must be removed');
    const before = JSON.stringify(controller.getSnapshot()); const saved = storage.getItem(cache.HOST_RECOVERY_KEY);
    finishInitial(first, outcome); await creating; sb.emit('game_players'); await settle();
    assert.equal(JSON.stringify(controller.getSnapshot()), before, `${change}/${outcome}: stale work changed current state`);
    assert.equal(storage.getItem(cache.HOST_RECOVERY_KEY), saved);
    controller.dispose();
  }
});

test('ACTUAL HOST: failed creation never subscribes and initial roster failure preserves explicit retry', async () => {
  const { sb, first, subscriptions } = delayedInitialRoster(); const rpc = sb.rpc; let creates = 0;
  sb.rpc = (name, args) => name === 'create_game' && ++creates === 1 ? Promise.resolve({ data: null, error: { message: 'synthetic creation failure' } }) : rpc(name, args);
  const controller = new LiveHostController(sb, memoryStorage()); controller.setAccount('synthetic-host', false);
  await controller.create('biology', 12);
  assert.equal(subscriptions(), 0); assert.equal(controller.getSnapshot().ready, false); assert.equal(controller.getSnapshot().busy, false);
  const retryCreate = controller.create('biology', 12); await settle(); first.reject(new Error('synthetic roster failure')); await retryCreate;
  assert.equal(subscriptions(), 1); assert.equal(controller.getSnapshot().phase, 'lobby'); assert.equal(controller.getSnapshot().ready, true);
  assert.equal(controller.getSnapshot().busy, false); assert.match(controller.getSnapshot().err, /Retry players/);
  sb.state.players = [player()]; await controller.retryPlayers();
  assert.equal(controller.getSnapshot().players.length, 1); assert.equal(controller.getSnapshot().err, '');
  controller.dispose();
});
