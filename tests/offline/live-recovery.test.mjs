import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, pageHarness, elements, textContent, memoryStorage } from '../support/source-harness.mjs';
import { liveClientDouble } from '../support/live-client-double.mjs';

const cache = loadSourceModule('lib/live-session-cache.ts');
const { LiveHostController } = loadSourceModule('lib/live-host-controller.ts', { './live': loadSourceModule('lib/live.ts'), './live-session-cache': cache });
const owner = 'synthetic-host-1';
const record = (changes = {}) => ({ version: 1, sessionId: 'old-room', code: 'OLD001', ownerId: owner, ts: Date.now(), teams: {}, teamMode: false, ...changes });
const receipt = (changes = {}) => ({ version: 1, sessionId: 'synthetic-room-1', playerId: 'synthetic-player-1', index: 0, ownerId: null, ts: Date.now(), result: { is_correct: true, correct_index: 0, points: 100 }, ...changes });
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function savedController(sb = liveClientDouble(), saved = record()) {
  const storage = memoryStorage(); cache.writeHostRecovery(saved, storage);
  const controller = new LiveHostController(sb, storage); controller.setAccount(owner, false);
  return { controller, storage, sb };
}

test('ACTUAL HOST: initial auth loading preserves cache without enabling controls', () => {
  const storage = memoryStorage(); cache.writeHostRecovery(record(), storage);
  const sb = liveClientDouble(); const controller = new LiveHostController(sb, storage);
  controller.setAccount(null, true);
  assert.ok(storage.getItem(cache.HOST_RECOVERY_KEY)); assert.equal(controller.getSnapshot().ready, false);
  assert.equal(sb.calls.length, 0);
  controller.setAccount(owner, false);
  assert.equal(controller.getSnapshot().resume.code, 'OLD001');
});
test('ACTUAL HOST: account mismatch cannot resume or send RPCs; logout removes controls', async () => {
  const { controller, sb, storage } = savedController();
  controller.setAccount('different-user', false); await controller.restore();
  assert.equal(sb.calls.length, 0); assert.equal(controller.getSnapshot().ready, false);
  assert.match(controller.getSnapshot().err, /account/);
  controller.setAccount(owner, false); await controller.restore();
  assert.equal(controller.getSnapshot().ready, true);
  controller.setAccount(null, false);
  assert.equal(controller.getSnapshot().ready, false); assert.equal(controller.getSnapshot().phase, 'setup');
  assert.ok(storage.getItem(cache.HOST_RECOVERY_KEY));
});
test('ACTUAL HOST: completed, unavailable and permission-error restores stay distinct and non-destructive', async () => {
  const done = savedController(liveClientDouble({ status: 'complete' }));
  await done.controller.restore();
  assert.equal(done.controller.getSnapshot().phase, 'complete');
  assert.match(done.controller.getSnapshot().notice, /already ended/);
  assert.equal(done.storage.getItem(cache.HOST_RECOVERY_KEY), null);
  await done.controller.begin(); await done.controller.advance();
  assert.equal(done.sb.calls.filter((c) => ['start_game', 'next_question'].includes(c.name)).length, 0);
  for (const response of [{ data: [], error: null }, { data: [null], error: null }, { data: null, error: null }, { data: null, error: { message: 'permission denied' } }]) {
    const sb = liveClientDouble(); const rpc = sb.rpc;
    sb.rpc = (name, args) => name === 'get_live_question' ? Promise.resolve(response) : rpc(name, args);
    const { controller, storage } = savedController(sb); await controller.restore();
    assert.equal(controller.getSnapshot().ready, false); assert.equal(controller.getSnapshot().phase, 'setup');
    assert.ok(controller.getSnapshot().err);
    if (response.error) assert.match(controller.getSnapshot().err, /permission denied/);
    else assert.doesNotMatch(controller.getSnapshot().err, /not found|deleted|ended/i);
    assert.equal(cache.readHostRecovery(storage).record.sessionId, 'old-room', 'unavailable state cannot delete a saved room');
    assert.equal(controller.getSnapshot().resume.sessionId, 'old-room', 'failed restore remains retryable');
    await controller.begin(); await controller.advance();
    assert.equal(sb.calls.filter((c) => ['start_game', 'next_question'].includes(c.name)).length, 0);
  }
});
test('ACTUAL HOST: successful create and lobby joins do not require a pre-start question row', async () => {
  const sb = liveClientDouble(); const rpc = sb.rpc; let preStartReads = 0;
  sb.rpc = (name, args) => {
    if (name === 'get_live_question' && sb.state.status === 'lobby') {
      preStartReads++; return Promise.resolve({ data: [], error: null });
    }
    return rpc(name, args);
  };
  const storage = memoryStorage(); const controller = new LiveHostController(sb, storage);
  controller.setAccount(owner, false); await controller.create('biology', 12);
  assert.equal(controller.getSnapshot().phase, 'lobby'); assert.equal(controller.getSnapshot().ready, true);
  sb.state.players.push({ id: 'late', alias: 'Late Test', score: 0 });
  sb.emit('game_players'); await settle();
  assert.equal(controller.getSnapshot().players.length, 2);
  assert.equal(controller.getSnapshot().ready, true); assert.equal(preStartReads, 0);
  await controller.begin();
  assert.equal(sb.calls.filter((c) => c.name === 'start_game').length, 1);
  assert.equal(controller.getSnapshot().phase, 'active'); assert.equal(controller.getSnapshot().ready, true);
  assert.equal(preStartReads, 0);
});
test('ACTUAL HOST: a late failed created-lobby player read cannot reset an active room', async () => {
  const sb = liveClientDouble(); const from = sb.from; const delayed = defer(); let reads = 0;
  sb.from = (...args) => {
    const query = from(...args); const order = query.order.bind(query);
    return { select() { return this; }, eq() { return this; }, order() { return ++reads === 2 ? delayed.promise : order(); } };
  };
  const controller = new LiveHostController(sb, memoryStorage()); controller.setAccount(owner, false);
  await controller.create('biology', 12);
  sb.emit('game_players'); await settle();
  await controller.begin();
  assert.equal(controller.getSnapshot().phase, 'active'); assert.equal(controller.getSnapshot().ready, true);
  delayed.reject(new Error('obsolete lobby read failed')); await settle();
  assert.equal(controller.getSnapshot().phase, 'active'); assert.equal(controller.getSnapshot().ready, true);
  assert.equal(controller.getSnapshot().err, '');
});
test('ACTUAL HOST: delayed old restore cannot overwrite a newly created room', async () => {
  const sb = liveClientDouble(); const original = sb.rpc; const delayed = defer();
  sb.rpc = (name, args) => {
    if (name === 'create_game') return Promise.resolve({ data: [{ session_id: 'new-room', code: 'NEW001' }], error: null });
    if (name === 'get_live_question' && args.p_session_id === 'old-room') return delayed.promise;
    return original(name, args);
  };
  const { controller, storage } = savedController(sb);
  const old = controller.restore(); await controller.create('biology', 12);
  delayed.resolve(await original('get_live_question', { p_session_id: 'old-room' })); await old;
  assert.equal(controller.getSnapshot().code, 'NEW001'); assert.equal(controller.getSnapshot().ready, true);
  assert.equal(cache.readHostRecovery(storage).record.sessionId, 'new-room');
});
test('ACTUAL HOST: delayed restore after account switch or unmount cannot enable controls', async () => {
  for (const action of ['switch', 'dispose']) {
    const sb = liveClientDouble(); const original = sb.rpc; const delayed = defer();
    sb.rpc = (name, args) => name === 'get_live_question' ? delayed.promise : original(name, args);
    const { controller } = savedController(sb); const pending = controller.restore();
    if (action === 'switch') controller.setAccount('other-user', false); else controller.dispose();
    delayed.resolve(await original('get_live_question', { p_session_id: 'old-room' })); await pending;
    assert.equal(controller.getSnapshot().ready, false);
    if (action === 'switch') assert.equal(controller.getSnapshot().ownerId, 'other-user');
  }
});
test('ACTUAL HOST: duplicate player updates and host remount preserve projector teams', async () => {
  const players = ['b', 'd', 'f'].map((id) => ({ id, alias: `Test ${id}`, score: 0 }));
  const sb = liveClientDouble({ players }); const { controller, storage } = savedController(sb);
  await controller.restore(); controller.toggleTeams();
  const before = { ...controller.getSnapshot().teams };
  sb.state.players = [{ id: 'a', alias: 'Test late', score: 7 }, ...players];
  sb.emit(); sb.emit(); await settle();
  for (const id of Object.keys(before)) assert.equal(controller.getSnapshot().teams[id], before[id]);
  const after = JSON.stringify(controller.getSnapshot().teams);
  controller.dispose();
  const remount = new LiveHostController(sb, storage); remount.setAccount(owner, false); await remount.restore();
  assert.equal(JSON.stringify(remount.getSnapshot().teams), after);
  assert.equal(remount.getSnapshot().teamMode, true);
  assert.equal(remount.getSnapshot().players[0].score, 7, 'score comes from server response');
});
test('ACTUAL CACHE: malformed, expired and unavailable host storage fails visibly', async () => {
  for (const value of ['{bad json', JSON.stringify({ version: 99 }), JSON.stringify(record({ ts: 1 }))]) {
    const storage = memoryStorage(); storage.setItem(cache.HOST_RECOVERY_KEY, value);
    const controller = new LiveHostController(liveClientDouble(), storage); controller.setAccount(owner, false);
    assert.equal(controller.getSnapshot().resume, null); assert.ok(controller.getSnapshot().notice);
  }
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const controller = new LiveHostController(liveClientDouble(), unavailable); controller.setAccount(owner, false);
  assert.match(controller.getSnapshot().notice, /unavailable/);
  await controller.create('biology', 12);
  assert.equal(controller.getSnapshot().ready, true, 'storage failure does not fabricate a server failure');
  assert.match(controller.getSnapshot().notice, /unavailable/);
});
test('ACTUAL CACHE: receipt is strictly bound to game, player, question and known user', () => {
  const storage = memoryStorage(); const ack = receipt({ ownerId: 'student-A' });
  cache.writeAcknowledgedAnswer(ack, storage);
  assert.equal(cache.readAcknowledgedAnswer(ack, storage).receipt.result.points, 100);
  for (const changes of [{ sessionId: 'other-room' }, { playerId: 'other-player' }, { index: 1 }, { ownerId: 'student-B' }, { ownerId: null }]) {
    assert.equal(cache.readAcknowledgedAnswer({ ...ack, ...changes }, storage).receipt, null);
  }
  storage.setItem(cache.ANSWER_RECEIPT_KEY, '{bad');
  assert.equal(cache.readAcknowledgedAnswer(ack, storage).error, 'malformed');
  cache.writeAcknowledgedAnswer(receipt({ ts: 1 }), storage);
  assert.equal(cache.readAcknowledgedAnswer(receipt(), storage).error, 'expired');
  assert.equal(cache.readAcknowledgedAnswer(ack, null).error, 'unavailable');
  assert.equal(cache.writeAcknowledgedAnswer(ack, null), 'unavailable');
});

test('ACTUAL STUDENT: acknowledged same-browser answer survives reload without a new submission', async () => {
  const storage = memoryStorage();
  storage.setItem('legends_arena_live', JSON.stringify({ code: 'LAB001', room: 'synthetic-room-1', player: 'synthetic-player-1', alias: 'Test Finch', ts: Date.now() }));
  const sb = liveClientDouble({ status: 'active' }); const original = pageHarness('app/join/page.tsx', sb, storage);
  const clickRejoin = async (h) => {
    const start = await h.render(); const button = elements(start).find((e) => e.type === 'button' && /Rejoin game/.test(textContent(e)));
    assert.ok(button); await button.props.onClick(); return h.render();
  };
  let remount;
  try {
    const q = await clickRejoin(original);
    await elements(q).find((e) => e.type === 'AnswerTile' && e.props.index === 0).props.onClick();
    assert.match(textContent(await original.render()), /Correct!/);
    original.unmount(); remount = pageHarness('app/join/page.tsx', sb, storage);
    const restored = await clickRejoin(remount);
    assert.match(textContent(restored), /Correct!/); assert.match(textContent(restored), /acknowledged answer saved on this device/);
    assert.equal(elements(restored).filter((e) => e.type === 'AnswerTile').length, 0);
    assert.equal(sb.calls.filter((c) => c.name === 'submit_answer').length, 1);
  } finally { original.unmount(); remount?.unmount(); }
});
test('ACTUAL STUDENT: failed deferred claim remains stored and explicit retry can confirm it', async () => {
  const storage = memoryStorage(); storage.setItem('legends_pending_claim', 'synthetic-player-1');
  const sb = liveClientDouble(); const original = sb.rpc; let calls = 0;
  sb.rpc = (name, args) => name === 'claim_game_xp' ? Promise.resolve(++calls === 1 ? { data: null, error: { message: 'temporarily unavailable' } } : { data: [{ awarded: 100, total_xp: 100 }], error: null }) : original(name, args);
  const harness = pageHarness('app/join/page.tsx', sb, storage, { user: { id: 'student-A' }, loading: false });
  try {
    let tree = await harness.render(); await settle(); tree = await harness.render();
    assert.equal(cache.readPendingClaim(storage).claim.playerId, 'synthetic-player-1');
    assert.equal(cache.readPendingClaim(storage).claim.ownerId, 'student-A');
    assert.match(textContent(tree), /not been confirmed as saved/); assert.equal(calls, 1);
    const retry = elements(tree).find((e) => e.type === 'button' && textContent(e) === 'Retry saving score');
    assert.ok(retry); retry.props.onClick(); await settle(); tree = await harness.render();
    assert.equal(storage.getItem('legends_pending_claim'), null); assert.match(textContent(tree), /Saved!/); assert.equal(calls, 2);
  } finally { harness.unmount(); }
});

function storedStudent(storage) {
  storage.setItem('legends_arena_live', JSON.stringify({ code: 'LAB001', room: 'synthetic-room-1', player: 'synthetic-player-1', alias: 'Test Finch', ts: Date.now() }));
}
async function resumeStudent(harness) {
  const tree = await harness.render();
  const button = elements(tree).find((e) => e.type === 'button' && /Rejoin game/.test(textContent(e)));
  assert.ok(button); await button.props.onClick(); return harness.render();
}

test('ACTUAL STUDENT: late claim after logout, account switch, rejoin or unmount cannot apply or clear pending work', async () => {
  for (const change of ['logout', 'switch', 'rejoin', 'unmount']) for (const outcome of ['success', 'error']) {
    const storage = memoryStorage(); storedStudent(storage);
    storage.setItem('legends_pending_claim', 'synthetic-player-1');
    const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc; const response = defer(); let claims = 0;
    sb.rpc = (name, args) => name === 'claim_game_xp' ? (++claims, response.promise) : rpc(name, args);
    const auth = { user: { id: 'student-A' }, loading: false };
    const harness = pageHarness('app/join/page.tsx', sb, storage, auth);
    try {
      await harness.render(); await settle(); assert.equal(claims, 1);
      if (change === 'logout') auth.user = null;
      if (change === 'switch') auth.user = { id: 'student-B' };
      if (change === 'rejoin') await resumeStudent(harness);
      else if (change === 'unmount') harness.unmount();
      else await harness.render();
      if (outcome === 'error') response.reject(new Error('obsolete claim failure'));
      else response.resolve({ data: [{ awarded: 100, total_xp: 999 }], error: null });
      await settle();
      assert.equal(cache.readPendingClaim(storage).claim.ownerId, 'student-A', change);
      if (change !== 'unmount') {
        const tree = await harness.render(); assert.doesNotMatch(textContent(tree), /Saved!|999 total|obsolete claim failure/, change);
        if (change === 'rejoin') assert.match(textContent(tree), /Question 1/);
      }
      assert.equal(claims, 1, 'a changed account must not retry the old claim');
    } finally { harness.unmount(); }
  }
});
test('ACTUAL STUDENT: account change clears the in-memory answer and stops old refresh work', async () => {
  const storage = memoryStorage(); storedStudent(storage);
  const sb = liveClientDouble({ status: 'active' }); const auth = { user: { id: 'student-A' }, loading: false };
  const harness = pageHarness('app/join/page.tsx', sb, storage, auth);
  try {
    const q = await resumeStudent(harness);
    await elements(q).find((e) => e.type === 'AnswerTile' && e.props.index === 0).props.onClick();
    assert.match(textContent(await harness.render()), /Correct!/);
    auth.user = { id: 'student-B' }; await harness.render(); const calls = sb.calls.length;
    sb.emit(); await settle();
    assert.doesNotMatch(textContent(await harness.render()), /Correct!|Saved!/);
    assert.equal(sb.calls.length, calls, 'obsolete subscription must not fetch another user context');
  } finally { harness.unmount(); }
});
test('ACTUAL STUDENT: late answer cannot replace a newer authoritative question', async () => {
  const storage = memoryStorage(); storedStudent(storage);
  const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc; const answer = defer(); let index = 0;
  sb.rpc = async (name, args) => {
    if (name === 'submit_answer') return answer.promise;
    const response = await rpc(name, args);
    if (name === 'get_live_question') response.data[0].index = index;
    return response;
  };
  const harness = pageHarness('app/join/page.tsx', sb, storage);
  try {
    const q = await resumeStudent(harness);
    const pending = elements(q).find((e) => e.type === 'AnswerTile' && e.props.index === 0).props.onClick();
    index = 1; sb.emit(); await settle();
    const nextQuestion = await harness.render();
    assert.match(textContent(nextQuestion), /Question 2/);
    assert.ok(elements(nextQuestion).filter((e) => e.type === 'AnswerTile').every((e) => !e.props.disabled), 'new question is playable before old acknowledgement arrives');
    answer.resolve({ data: [{ is_correct: true, correct_index: 0, points: 100 }], error: null }); await pending;
    const tree = await harness.render(); assert.match(textContent(tree), /Question 2/); assert.doesNotMatch(textContent(tree), /Correct!/);
    assert.equal(storage.getItem(cache.ANSWER_RECEIPT_KEY), null, 'obsolete result was not promoted to the current receipt');
  } finally { harness.unmount(); }
});
test('ACTUAL STUDENT: older loadState response cannot rewind the current question', async () => {
  const storage = memoryStorage(); storedStudent(storage);
  const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc; const older = defer(); let reads = 0;
  sb.rpc = async (name, args) => {
    if (name === 'get_live_question' && ++reads === 2) return older.promise;
    const response = await rpc(name, args);
    if (name === 'get_live_question' && reads >= 3) response.data[0].index = 1;
    return response;
  };
  const harness = pageHarness('app/join/page.tsx', sb, storage);
  try {
    await resumeStudent(harness); sb.emit(); sb.emit(); await settle();
    assert.match(textContent(await harness.render()), /Question 2/);
    older.resolve(await rpc('get_live_question', { p_session_id: 'synthetic-room-1' })); await settle();
    assert.match(textContent(await harness.render()), /Question 2/);
  } finally { harness.unmount(); }
});
test('ACTUAL HOST: obsolete subscription cannot read after logout', async () => {
  const { controller, sb } = savedController(); await controller.restore();
  controller.setAccount(null, false); const calls = sb.calls.length;
  sb.emit(); await settle(); assert.equal(sb.calls.length, calls); assert.equal(controller.getSnapshot().ready, false);
});
test('ACTUAL STUDENT: terminal or lobby transition invalidates a delayed answer', async () => {
  for (const status of ['complete', 'lobby']) {
    const storage = memoryStorage(); storedStudent(storage);
    const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc; const answer = defer();
    sb.rpc = (name, args) => name === 'submit_answer' ? answer.promise : rpc(name, args);
    const harness = pageHarness('app/join/page.tsx', sb, storage);
    try {
      const q = await resumeStudent(harness);
      const pending = elements(q).find((e) => e.type === 'AnswerTile' && e.props.index === 0).props.onClick();
      sb.state.status = status; sb.emit(); await settle();
      const expected = status === 'complete' ? /GAME OVER/ : /Waiting for the host/;
      assert.match(textContent(await harness.render()), expected);
      answer.resolve({ data: [{ is_correct: true, correct_index: 0, points: 100 }], error: null }); await pending;
      assert.match(textContent(await harness.render()), expected);
      assert.equal(storage.getItem(cache.ANSWER_RECEIPT_KEY), null);
    } finally { harness.unmount(); }
  }
});
test('ACTUAL STUDENT: stale failed load cannot replace a newer successful state with an error', async () => {
  const storage = memoryStorage(); storedStudent(storage);
  const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc; const older = defer(); let reads = 0;
  sb.rpc = async (name, args) => {
    if (name === 'get_live_question' && ++reads === 2) return older.promise;
    const result = await rpc(name, args);
    if (name === 'get_live_question' && reads >= 3) result.data[0].index = 1;
    return result;
  };
  const harness = pageHarness('app/join/page.tsx', sb, storage);
  try {
    await resumeStudent(harness); sb.emit(); sb.emit(); await settle();
    older.reject(new Error('obsolete load failure')); await settle();
    const tree = await harness.render(); assert.match(textContent(tree), /Question 2/); assert.doesNotMatch(textContent(tree), /obsolete load failure/);
  } finally { harness.unmount(); }
});

test('ACTUAL HOST: create, restore and mutation success/error/finally cannot touch replacement contexts', async () => {
  for (const operation of ['create', 'restore', 'begin', 'advance']) for (const change of ['new-room', 'switch', 'dispose']) for (const outcome of ['success', 'error']) {
    const sb = liveClientDouble({ status: operation === 'advance' ? 'active' : 'lobby' });
    const { controller, storage } = savedController(sb);
    if (operation === 'begin' || operation === 'advance') await controller.restore();
    const rpc = sb.rpc; const delayed = defer(); let blocked = false;
    const target = { create: 'create_game', restore: 'get_live_question', begin: 'start_game', advance: 'next_question' }[operation];
    sb.rpc = (name, args) => {
      if (name === target && !blocked) { blocked = true; return delayed.promise; }
      if (name === 'create_game') return Promise.resolve({ data: [{ session_id: 'replacement', code: 'NEW001' }], error: null });
      return rpc(name, args);
    };
    const pending = operation === 'create' ? controller.create('biology', 12) : controller[operation]();
    if (change === 'new-room') await controller.create('biology', 12);
    else if (change === 'switch') controller.setAccount('different-owner', false);
    else controller.dispose();
    const before = JSON.stringify(controller.getSnapshot()); const saved = storage.getItem(cache.HOST_RECOVERY_KEY);
    if (outcome === 'error') delayed.reject(new Error(`obsolete ${operation} failure`));
    else delayed.resolve({ data: operation === 'create' ? [{ session_id: 'obsolete', code: 'OLD999' }] : operation === 'restore' ? [{ status: 'active', index: 0 }] : null, error: null });
    await pending;
    assert.equal(JSON.stringify(controller.getSnapshot()), before, `${operation}/${change}/${outcome}: success, rejection or finally changed new state`);
    assert.equal(storage.getItem(cache.HOST_RECOVERY_KEY), saved, `${operation}/${change}/${outcome}: changed saved room`);
  }
});

test('ACTUAL HOST: late lobby-player success/error and retry cleanup respect every replacement boundary', async () => {
  for (const operation of ['notification', 'retry']) for (const change of ['start', 'new-room', 'switch', 'dispose']) for (const outcome of ['success', 'error']) {
    if (operation === 'retry' && change === 'start') continue; // Retry owns busy, so Start is intentionally gated until it finishes.
    const sb = liveClientDouble(); const from = sb.from; const delayed = defer(); let reads = 0;
    sb.from = (...args) => {
      const query = from(...args); const order = query.order.bind(query);
      return { select() { return this; }, eq() { return this; }, order() { return ++reads === 2 ? delayed.promise : order(); } };
    };
    const { controller, storage } = savedController(sb); await controller.create('biology', 12);
    const pending = operation === 'retry' ? controller.retryPlayers() : (sb.emit('game_players'), settle());
    if (change === 'start') await controller.begin();
    else if (change === 'new-room') await controller.create('chemistry', 11);
    else if (change === 'switch') controller.setAccount('another-owner', false);
    else controller.dispose();
    const before = JSON.stringify(controller.getSnapshot()); const saved = storage.getItem(cache.HOST_RECOVERY_KEY);
    if (outcome === 'error') delayed.reject(new Error('obsolete roster failure'));
    else delayed.resolve({ data: [{ id: 'obsolete', alias: 'Obsolete', score: 999 }], error: null });
    await pending; await settle();
    assert.equal(JSON.stringify(controller.getSnapshot()), before, `${operation}/${change}/${outcome}`);
    assert.equal(storage.getItem(cache.HOST_RECOVERY_KEY), saved);
  }
});

test('ACTUAL HOST: newest snapshot owns success and rejection; stale timer identity cannot advance it', async () => {
  for (const outcome of ['success', 'error']) {
    const { controller, sb } = savedController(liveClientDouble({ status: 'active' })); await controller.restore();
    const rpc = sb.rpc; const delayed = defer(); let reads = 0;
    sb.rpc = async (name, args) => {
      if (name === 'get_live_question' && ++reads === 1) return delayed.promise;
      const result = await rpc(name, args);
      if (name === 'get_live_question') result.data[0].index = 1;
      return result;
    };
    sb.emit('game_sessions'); sb.emit('game_sessions'); await settle();
    assert.equal(controller.getSnapshot().q.index, 1);
    const before = JSON.stringify(controller.getSnapshot());
    if (outcome === 'error') delayed.reject(new Error('obsolete snapshot failure'));
    else delayed.resolve({ data: [{ status: 'complete', index: 0 }], error: null });
    await settle(); assert.equal(JSON.stringify(controller.getSnapshot()), before);
    await controller.advance('old-room', 0); await controller.advance('wrong-room', 1);
    assert.equal(sb.calls.filter((c) => c.name === 'next_question').length, 0);
  }
});

test('ACTUAL STUDENT: stale answer error/finally cannot clear the next answer lock', async () => {
  for (const outcome of ['success', 'error']) {
    const storage = memoryStorage(); storedStudent(storage);
    const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc; const old = defer(); const next = defer(); let index = 0;
    sb.rpc = async (name, args) => {
      if (name === 'submit_answer') return args.p_index === 0 ? old.promise : next.promise;
      const result = await rpc(name, args); if (name === 'get_live_question') result.data[0].index = index; return result;
    };
    const harness = pageHarness('app/join/page.tsx', sb, storage);
    try {
      let tree = await resumeStudent(harness);
      const first = elements(tree).find((e) => e.type === 'AnswerTile').props.onClick();
      index = 1; sb.emit('game_sessions'); await settle(); tree = await harness.render();
      const second = elements(tree).find((e) => e.type === 'AnswerTile').props.onClick();
      if (outcome === 'error') old.reject(new Error('obsolete answer failure'));
      else old.resolve({ data: [{ is_correct: true, correct_index: 0, points: 100 }], error: null });
      await first; tree = await harness.render();
      assert.match(textContent(tree), /Question 2/); assert.doesNotMatch(textContent(tree), /obsolete answer failure|Correct!/);
      assert.ok(elements(tree).filter((e) => e.type === 'AnswerTile').every((e) => e.props.disabled), 'new request still owns busy');
      next.reject(new Error('current answer failure')); await second; tree = await harness.render();
      assert.match(textContent(tree), /current answer failure/);
      assert.ok(elements(tree).filter((e) => e.type === 'AnswerTile').every((e) => !e.props.disabled), 'current failure releases its own lock');
    } finally { harness.unmount(); }
  }
});

test('ACTUAL STUDENT: late join/rejoin success/error/finally cannot change a new account or newer connection', async () => {
  for (const operation of ['join_game', 'live_rejoin']) for (const change of ['switch', 'rejoin', 'unmount']) for (const outcome of ['success', 'error']) {
    const storage = memoryStorage(); storedStudent(storage); const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc; const delayed = defer(); let joins = 0;
    sb.rpc = (name, args) => name === operation && ++joins === 1 ? delayed.promise : rpc(name, args);
    const auth = { user: { id: 'student-A' }, loading: false }; const harness = pageHarness('app/join/page.tsx', sb, storage, auth);
    try {
      const start = await harness.render(); const button = elements(start).find((e) => e.type === 'button' && /Rejoin game/.test(textContent(e)));
      const pending = operation === 'live_rejoin' ? button.props.onClick() : elements(start).find((e) => e.type === 'form').props.onSubmit({ preventDefault() {} });
      if (change === 'switch') { auth.user = { id: 'student-B' }; await harness.render(); }
      else if (change === 'rejoin') await button.props.onClick();
      else harness.unmount();
      const before = change === 'unmount' ? '' : textContent(await harness.render());
      if (outcome === 'error') delayed.reject(new Error('obsolete rejoin failure'));
      else delayed.resolve({ data: [{ session_id: 'obsolete-room', player_id: 'obsolete-player', status: 'active', score: 999 }], error: null });
      await pending;
      if (change !== 'unmount') assert.equal(textContent(await harness.render()), before, `${change}/${outcome}`);
      assert.equal(sb.calls.filter((c) => c.name === 'get_live_question' && c.args.p_session_id === 'obsolete-room').length, 0);
    } finally { harness.unmount(); }
  }
});

test('ACTUAL STUDENT: late final-score reads and retry errors cannot affect a newer account', async () => {
  for (const outcome of ['success', 'error']) {
    const storage = memoryStorage(); storedStudent(storage); const sb = liveClientDouble({ status: 'complete' }); const from = sb.from; const delayed = defer(); let reads = 0;
    sb.from = (...args) => {
      const query = from(...args); const order = query.order.bind(query);
      return { select() { return this; }, eq() { return this; }, order() { return ++reads === 1 ? Promise.resolve({ data: null, error: { message: 'first score read failed' } }) : reads === 2 ? delayed.promise : order(); } };
    };
    const auth = { user: null, loading: false }; const harness = pageHarness('app/join/page.tsx', sb, storage, auth);
    try {
      let tree = await resumeStudent(harness); assert.match(textContent(tree), /Loading final scores/);
      const retry = elements(tree).find((e) => e.type === 'button' && textContent(e) === 'Retry loading results');
      assert.ok(retry); retry.props.onClick(); await settle();
      auth.user = { id: 'student-B' }; tree = await harness.render(); const before = textContent(tree);
      if (outcome === 'error') delayed.reject(new Error('obsolete final-score failure'));
      else delayed.resolve({ data: [{ id: 'synthetic-player-1', alias: 'Old', score: 999 }], error: null });
      await settle(); assert.equal(textContent(await harness.render()), before);
      assert.ok(storage.getItem('legends_arena_live'), 'obsolete score result must not clear recovery data');
    } finally { harness.unmount(); }
  }
});

test('ACTUAL STUDENT: connection cleanup cannot unlock an answer started by a newer state read', async () => {
  for (const operation of ['join', 'rejoin']) for (const outcome of ['success', 'error']) {
    const storage = memoryStorage(); storedStudent(storage); const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc;
    const initial = defer(); const answer = defer(); let reads = 0;
    sb.rpc = async (name, args) => {
      if (name === 'submit_answer') return answer.promise;
      if (name === 'get_live_question' && ++reads === 1) return initial.promise;
      const result = await rpc(name, args); if (name === 'get_live_question') result.data[0].index = 1; return result;
    };
    const harness = pageHarness('app/join/page.tsx', sb, storage);
    try {
      const start = await harness.render();
      const connection = operation === 'join' ? elements(start).find((e) => e.type === 'form').props.onSubmit({ preventDefault() {} }) : elements(start).find((e) => e.type === 'button' && /Rejoin game/.test(textContent(e))).props.onClick();
      await settle(); sb.emit('game_sessions'); await settle(); let tree = await harness.render();
      assert.match(textContent(tree), /Question 2/);
      const submit = elements(tree).find((e) => e.type === 'AnswerTile').props.onClick();
      if (outcome === 'error') initial.reject(new Error('obsolete connection load failure'));
      else initial.resolve({ data: [{ status: 'active', index: 0 }], error: null });
      await connection; tree = await harness.render();
      assert.match(textContent(tree), /Question 2/); assert.doesNotMatch(textContent(tree), /obsolete connection load failure/);
      assert.ok(elements(tree).filter((e) => e.type === 'AnswerTile').every((e) => e.props.disabled));
      answer.resolve({ data: [{ is_correct: true, correct_index: 0, points: 100 }], error: null }); await submit;
      assert.match(textContent(await harness.render()), /Correct!/);
    } finally { harness.unmount(); }
  }
});

test('ACTUAL STUDENT: answer success/error cannot write receipts or UI after account change or unmount', async () => {
  for (const change of ['switch', 'unmount']) for (const outcome of ['success', 'error']) {
    const storage = memoryStorage(); storedStudent(storage); const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc; const delayed = defer();
    sb.rpc = (name, args) => name === 'submit_answer' ? delayed.promise : rpc(name, args);
    const auth = { user: { id: 'student-A' }, loading: false }; const harness = pageHarness('app/join/page.tsx', sb, storage, auth);
    try {
      const tree = await resumeStudent(harness); const pending = elements(tree).find((e) => e.type === 'AnswerTile').props.onClick();
      if (change === 'switch') { auth.user = { id: 'student-B' }; await harness.render(); } else harness.unmount();
      const before = change === 'unmount' ? '' : textContent(await harness.render());
      if (outcome === 'error') delayed.reject(new Error('obsolete answer failure'));
      else delayed.resolve({ data: [{ is_correct: true, correct_index: 0, points: 100 }], error: null });
      await pending; assert.equal(storage.getItem(cache.ANSWER_RECEIPT_KEY), null);
      if (change !== 'unmount') assert.equal(textContent(await harness.render()), before);
    } finally { harness.unmount(); }
  }
});
