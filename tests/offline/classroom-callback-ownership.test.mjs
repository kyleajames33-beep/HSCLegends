import test from 'node:test';
import assert from 'node:assert/strict';
import { pageHarness, elements, textContent, memoryStorage, loadSourceModule } from '../support/source-harness.mjs';
import { liveClientDouble } from '../support/live-client-double.mjs';
const cache = loadSourceModule('lib/live-session-cache.ts');
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const button = (tree, label) => elements(tree).find((node) => node.type === 'button' && textContent(node) === label);
const firstAnswer = (tree) => elements(tree).find((node) => node.type === 'AnswerTile' && node.props.index === 0);
const store = (storage) => storage.setItem('legends_arena_live', JSON.stringify({ code: 'LAB001', room: 'synthetic-room-1', player: 'synthetic-player-1', alias: 'Test Finch', ts: Date.now() }));
async function connect(page) {
  const rejoin = elements(await page.render()).find((node) => node.type === 'button' && /Rejoin game/.test(textContent(node)));
  assert.ok(rejoin); await rejoin.props.onClick(); return { rejoin, tree: await page.render() };
}

// Fixture-only response switching; there is no server ownership or receipt API.
test('ACTUAL RECOVERY: refresh remains available while an answer hangs, and late settlement cannot undo catch-up', async () => {
  for (const next of ['question', 'complete']) for (const outcome of ['success', 'error']) {
    const storage = memoryStorage(); store(storage); const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc;
    const held = deferred(); let index = 0;
    sb.rpc = async (name, args) => {
      if (name === 'submit_answer') return held.promise;
      const response = await rpc(name, args);
      if (name === 'get_live_question') response.data[0].index = index;
      return response;
    };
    const page = pageHarness('app/join/page.tsx', sb, storage);
    try {
      const { tree } = await connect(page); const answer = firstAnswer(tree).props.onClick(); await settle();
      const refresh = button(await page.render(), 'Refresh game state');
      assert.equal(refresh.props.disabled, false, 'a hung answer cannot disable the recovery read');
      if (next === 'complete') sb.state.status = 'complete'; else index = 1;
      await refresh.props.onClick(); // No session event was delivered.
      const caughtUp = textContent(await page.render());
      assert.match(caughtUp, next === 'complete' ? /GAME OVER/ : /Question 2\/2/);
      if (outcome === 'success') held.resolve({ data: [{ is_correct: true, correct_index: 0, points: 100 }], error: null });
      else held.reject(new Error('late obsolete answer failure'));
      await answer; await settle();
      assert.equal(textContent(await page.render()), caughtUp);
      assert.equal(storage.getItem(cache.ANSWER_RECEIPT_KEY), null, 'late answer cannot cache a stale receipt');
    } finally { page.unmount(); }
  }
});

test('ACTUAL CALLBACK OWNERSHIP: retained answer and refresh callbacks cannot adopt a replacement connection', async () => {
  for (const target of ['different-room', 'same-room-new-generation']) {
    const storage = memoryStorage(); store(storage); const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc;
    let joins = 0; const mutations = []; const reads = [];
    sb.rpc = async (name, args) => {
      if (name === 'live_rejoin') {
        const response = await rpc(name, args); joins++;
        if (joins > 1 && target === 'different-room') Object.assign(response.data[0], { session_id: 'replacement-room', player_id: 'replacement-player' });
        return response;
      }
      if (name === 'get_live_question') {
        reads.push(args.p_session_id); const response = await rpc(name, args);
        response.data[0].stem = `Question for ${args.p_session_id}`; return response;
      }
      if (name === 'submit_answer') mutations.push({ ...args });
      return rpc(name, args);
    };
    const page = pageHarness('app/join/page.tsx', sb, storage, { user: { id: 'same-student' }, loading: false });
    try {
      const { tree, rejoin } = await connect(page);
      const oldAnswer = firstAnswer(tree); const oldRefresh = button(tree, 'Refresh game state');
      await rejoin.props.onClick(); const replacement = await page.render();
      assert.match(textContent(replacement), /Question 1\/2/);
      const before = { mutations: mutations.length, reads: reads.length, text: textContent(replacement) };
      await oldAnswer.props.onClick(); await oldRefresh.props.onClick(); await settle();
      assert.equal(mutations.length, before.mutations, 'old answer must be rejected before submit_answer');
      assert.equal(reads.length, before.reads, 'old refresh must be rejected before get_live_question');
      assert.equal(textContent(await page.render()), before.text);
      assert.equal(storage.getItem(cache.ANSWER_RECEIPT_KEY), null);
      // A current handler remains usable; rejection is not a blanket RPC block.
      await firstAnswer(await page.render()).props.onClick();
      assert.equal(mutations.length, before.mutations + 1);
      assert.equal(mutations.at(-1).p_player_id, target === 'different-room' ? 'replacement-player' : 'synthetic-player-1');
      assert.match(textContent(await page.render()), /Correct!/);
    } finally { page.unmount(); }
  }
});

test('ACTUAL CALLBACK OWNERSHIP: retained buttons do not issue requests after account change or unmount', async () => {
  for (const transition of ['account', 'unmount']) {
    const storage = memoryStorage(); store(storage); const sb = liveClientDouble({ status: 'active' });
    const auth = { user: { id: 'student-A' }, loading: false }; const page = pageHarness('app/join/page.tsx', sb, storage, auth);
    try {
      const { tree } = await connect(page); const answer = firstAnswer(tree); const refresh = button(tree, 'Refresh game state');
      if (transition === 'account') { auth.user = { id: 'student-B' }; await page.render(); } else page.unmount();
      const calls = sb.calls.length; await answer.props.onClick(); await refresh.props.onClick();
      assert.equal(sb.calls.length, calls); assert.equal(storage.getItem(cache.ANSWER_RECEIPT_KEY), null);
    } finally { page.unmount(); }
  }
});

test('ACTUAL CALLBACK OWNERSHIP: a held refresh settles only for its originating connection', async () => {
  for (const outcome of ['success', 'error']) {
    const storage = memoryStorage(); store(storage); const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc;
    const held = deferred(); let joins = 0; let holdRead = false;
    sb.rpc = async (name, args) => {
      if (name === 'live_rejoin') {
        const response = await rpc(name, args);
        if (++joins > 1) Object.assign(response.data[0], { session_id: 'room-B', player_id: 'player-B' });
        return response;
      }
      if (name === 'get_live_question' && args.p_session_id === 'synthetic-room-1' && holdRead) return held.promise;
      const response = await rpc(name, args);
      if (name === 'get_live_question') response.data[0].stem = `Current ${args.p_session_id}`;
      return response;
    };
    const page = pageHarness('app/join/page.tsx', sb, storage);
    try {
      const { tree, rejoin } = await connect(page); holdRead = true;
      const request = button(tree, 'Refresh game state').props.onClick(); await settle();
      await rejoin.props.onClick(); const text = textContent(await page.render()); assert.match(text, /Current room-B/);
      if (outcome === 'error') held.reject(new Error('old refresh failed'));
      else { const response = await rpc('get_live_question', { p_session_id: 'synthetic-room-1' }); response.data[0].status = 'complete'; held.resolve(response); }
      await request; await settle();
      assert.equal(textContent(await page.render()), text); assert.ok(storage.getItem('legends_arena_live'));
    } finally { page.unmount(); }
  }
});

test('ACTUAL RECOVERY: another explicit refresh supersedes a hung refresh without enabling duplicate answers', async () => {
  const storage = memoryStorage(); store(storage); const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc;
  const held = deferred(); let reads = 0;
  sb.rpc = async (name, args) => {
    if (name === 'get_live_question' && ++reads === 2) return held.promise;
    const response = await rpc(name, args);
    if (name === 'get_live_question' && reads >= 3) response.data[0].index = 1;
    return response;
  };
  const page = pageHarness('app/join/page.tsx', sb, storage);
  try {
    const { tree } = await connect(page); const old = button(tree, 'Refresh game state').props.onClick(); await settle();
    const refresh = button(await page.render(), 'Refresh game state'); assert.equal(refresh.props.disabled, false);
    await refresh.props.onClick(); assert.match(textContent(await page.render()), /Question 2\/2/);
    held.resolve(await rpc('get_live_question', { p_session_id: 'synthetic-room-1' })); await old;
    assert.match(textContent(await page.render()), /Question 2\/2/);
    assert.equal(sb.calls.filter((call) => call.name === 'submit_answer').length, 0);
  } finally { page.unmount(); }
});

test('ACTUAL CALLBACK OWNERSHIP: an unanswered previous-question callback cannot submit after catch-up', async () => {
  const storage = memoryStorage(); store(storage); const sb = liveClientDouble({ status: 'active' }); const rpc = sb.rpc;
  let index = 0;
  sb.rpc = async (name, args) => {
    const response = await rpc(name, args);
    if (name === 'get_live_question') response.data[0].index = index;
    return response;
  };
  const page = pageHarness('app/join/page.tsx', sb, storage);
  try {
    const { tree } = await connect(page); const oldAnswer = firstAnswer(tree);
    index = 1; await button(tree, 'Refresh game state').props.onClick();
    assert.match(textContent(await page.render()), /Question 2\/2/);
    await oldAnswer.props.onClick();
    assert.equal(sb.calls.filter((call) => call.name === 'submit_answer').length, 0);
    await firstAnswer(await page.render()).props.onClick();
    const submissions = sb.calls.filter((call) => call.name === 'submit_answer');
    assert.equal(submissions.length, 1); assert.equal(submissions[0].args.p_index, 1);
  } finally { page.unmount(); }
});
