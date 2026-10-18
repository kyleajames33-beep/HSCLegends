import test from 'node:test';
import assert from 'node:assert/strict';
import { pageHarness, textContent, elements, sourceText, loadSourceModule } from '../support/classroom-candidate-harness.mjs';
import { fixture, defer, settle } from '../support/classroom-fixture.mjs';

const button = (tree, text) => elements(tree).find(e => e.type === 'button' && textContent(e).includes(text));
const tiles = tree => elements(tree).filter(e => e.type === 'AnswerTile');
async function restore(h) { const tree = await h.render(); const reconnect = button(tree, 'Reconnect my game'); assert.ok(reconnect); await reconnect.props.onClick(); return h.render(); }
async function refresh(h) { const tree = await h.render(); const retry = button(tree, 'Refresh') ?? button(tree, 'Retry loading game'); assert.ok(retry); await retry.props.onClick(); return h.render(); }

// These tests execute the copied actual route source and event handlers through a
// minimal hook/JSX double. They do not claim React hydration or browser coverage.
test('ACTUAL JOIN: default candidate is disconnected, with no legacy fallback or XP claim', async () => {
  const h = pageHarness(); try {
    const tree = await h.render(); assert.match(textContent(tree), /Local review only/);
    assert.equal(button(tree, 'Reconnect my game').props.disabled, true);
    const source = sourceText('app/join/secure-join.tsx');
    for (const forbidden of ['readAcknowledgedAnswer', 'writeAcknowledgedAnswer', 'liveRejoin', 'fetchPlayers', 'claimGameXp', 'localStorage']) assert.equal(source.includes(forbidden), false, forbidden);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: guest can join through the proposed injected grant transport without an account', async () => {
  const f = fixture(); const h = pageHarness(f.transport);
  try {
    let tree = await h.render();
    elements(tree).find(e => e.props?.['aria-label'] === 'Game code').props.onChange({ target: { value: 'lab001' } });
    elements(tree).find(e => e.props?.['aria-label'] === 'Your name').props.onChange({ target: { value: 'Guest Finch' } });
    tree = await h.render(); assert.equal(button(tree, 'Join').props.disabled, false);
    await elements(tree).find(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
    tree = await h.render(); assert.match(textContent(tree), /Question 1\/2/); assert.equal(tiles(tree).length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls.find(c => c[0] === 'join'))), ['join', { code: 'LAB001', alias: 'Guest Finch' }]);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: uncached committed receipt restores frozen question and accepted choice without resubmission', async () => {
  const f = fixture(); const receipt = await f.core.submit(f.proof, { index: 0, choice: 1 });
  f.room().questionSet = undefined; // Old bank/sealed set unavailable; accepted content still sufficient.
  const h = pageHarness(f.transport);
  try {
    const tree = await restore(h); const text = textContent(tree);
    assert.match(text, /Not quite/); assert.match(text, /Answer: Original A/); assert.match(text, /accepted choice: Original B/);
    assert.match(text, /confirmed by the server/); assert.equal(tiles(tree).length, 0);
    assert.equal(f.calls.filter(c => c[0] === 'submit').length, 0); assert.equal(f.state.answers.size, 1);
    assert.equal(f.state.players.get('alice').score, receipt.points);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: lost acknowledgement recovers committed result and awards only once', async () => {
  const f = fixture(); const submit = f.transport.submit;
  f.transport.submit = async (...args) => { await submit(...args); throw new Error('lost acknowledgement'); };
  const h = pageHarness(f.transport);
  try {
    const tree = await restore(h); const click = tiles(tree)[0].props.onClick;
    const first = click(); const repeat = click(); await Promise.all([first, repeat]);
    assert.match(textContent(await h.render()), /Correct!/); assert.equal(f.state.answers.size, 1);
    assert.equal(f.calls.filter(c => c[0] === 'submit').length, 1);
    assert.equal(f.state.players.get('alice').score, 147);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: replay displays originally accepted choice, not the clicked retry choice', async () => {
  const f = fixture(); const h = pageHarness(f.transport);
  try {
    const tree = await restore(h); await f.core.submit(f.proof, { index: 0, choice: 0 });
    await tiles(tree)[1].props.onClick();
    const text = textContent(await h.render()); assert.match(text, /Correct!/); assert.match(text, /accepted choice: Original A/);
    assert.equal(f.state.answers.size, 1); assert.equal(f.state.players.get('alice').score, 147);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: missing historical keys show recorded points with no fabricated correctness or learning retry', async () => {
  const f = fixture(); f.state.answers.set('alice:0', { questionIndex: 0, choice: 1, isCorrect: false, points: 0, answeredAt: 10 });
  f.room().questionSet = undefined;
  const h = pageHarness(f.transport);
  try {
    const tree = await restore(h); const text = textContent(tree);
    assert.match(text, /Answer recorded/); assert.match(text, /Historical question content is unavailable/); assert.match(text, /\+0 points recorded/);
    assert.doesNotMatch(text, /Correct!|Not quite|Original A|Original B|Answer:/);
    assert.equal(button(tree, 'Try again, unscored'), undefined); assert.equal(tiles(tree).length, 0);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: final standing is owned-only, supports past-end index/no question set, and never claims XP', async () => {
  const f = fixture(); f.room().status = 'complete'; f.room().currentIndex = 2; f.room().questionSet = undefined;
  f.state.players.get('alice').score = 147;
  const h = pageHarness(f.transport);
  try {
    const tree = await restore(h); const text = textContent(tree);
    assert.match(text, /#2/); assert.match(text, /147 pts/); assert.match(text, /No XP claim has been sent or confirmed/);
    assert.equal(f.calls.filter(c => c[0] === 'standing').length, 1); assert.equal(f.state.claims.size, 0); assert.equal(f.state.xp.size, 0);
    assert.equal(button(tree, 'Save my'), undefined); assert.doesNotMatch(text, /Same alias|bob/);
  } finally { h.unmount(); }
});

for (const field of ['sessionId', 'playerId', 'principalId']) test(`ACTUAL JOIN: ${field} snapshot binding mismatch fails closed`, async () => {
  const f = fixture(); const read = f.transport.ownSnapshot;
  f.transport.ownSnapshot = async b => ({ ...await read(b), [field]: 'other-person' });
  const h = pageHarness(f.transport);
  try {
    const tree = await restore(h); assert.match(textContent(tree), /could not be verified for your session/);
    assert.equal(tiles(tree).length, 0); assert.doesNotMatch(textContent(tree), /Original A|#1|GAME OVER/);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: principal mismatch in restored grant cannot start snapshot reads', async () => {
  const f = fixture(); f.transport.restore = async () => ({ ...f.binding, principalId: 'other-user' });
  const h = pageHarness(f.transport);
  try { assert.match(textContent(await restore(h)), /could not be verified/); assert.equal(f.calls.length, 0); }
  finally { h.unmount(); }
});

test('ACTUAL JOIN: mismatched own final standing never displays another player score', async () => {
  const f = fixture(); f.room().status = 'complete'; const standing = f.transport.ownStanding;
  f.transport.ownStanding = async b => ({ ...await standing(b), playerId: 'bob', score: 9999 });
  const h = pageHarness(f.transport);
  try { const text = textContent(await restore(h)); assert.match(text, /could not be verified/); assert.doesNotMatch(text, /9999|GAME OVER/); }
  finally { h.unmount(); }
});

test('ACTUAL JOIN: failed read hides stale answer controls and explicit retry recovers safely', async () => {
  const f = fixture(); const h = pageHarness(f.transport);
  try {
    const old = await restore(h); const read = f.transport.ownSnapshot;
    f.transport.ownSnapshot = async () => { throw new Error('internal connection details'); };
    const tree = await refresh(h); assert.match(textContent(tree), /could not be confirmed/); assert.doesNotMatch(textContent(tree), /internal connection/);
    assert.equal(tiles(tree).length, 0); await tiles(old)[0].props.onClick(); assert.equal(f.calls.filter(c => c[0] === 'submit').length, 0);
    f.transport.ownSnapshot = read; assert.equal(tiles(await refresh(h)).length, 2);
  } finally { h.unmount(); }
});

for (const outcome of ['success', 'failure']) test(`ACTUAL JOIN: delayed older ${outcome} cannot replace newer question`, async () => {
  const f = fixture(); const h = pageHarness(f.transport);
  try {
    const old = await restore(h); const read = f.transport.ownSnapshot; const delayed = defer(); const older = await read(f.binding); let first = true;
    f.transport.ownSnapshot = b => { if (first) { first = false; return delayed.promise; } return read(b); };
    const pending = button(old, 'Refresh').props.onClick(); f.room().currentIndex = 1;
    await button(old, 'Refresh').props.onClick();
    if (outcome === 'success') delayed.resolve(older); else delayed.reject(new Error('old failed read'));
    await pending; const tree = await h.render(); assert.match(textContent(tree), /Question 2\/2/); assert.match(textContent(tree), /Synthetic second/); assert.doesNotMatch(textContent(tree), /old failed read/);
    await tiles(old)[0].props.onClick(); assert.equal(f.calls.filter(c => c[0] === 'submit').length, 0);
  } finally { h.unmount(); }
});

for (const change of ['account-switch', 'logout', 'unmount', 'reset']) test(`ACTUAL JOIN: delayed answer after ${change} cannot restore previous content`, async () => {
  const f = fixture('account-a'); const auth = { user: { id: 'account-a' }, loading: false }; const h = pageHarness(f.transport, auth);
  const deferred = defer(); const submit = f.transport.submit; f.transport.submit = async (...args) => { const result = await submit(...args); await deferred.promise; return result; };
  try {
    const tree = await restore(h); const pending = tiles(tree)[0].props.onClick(); await settle();
    if (change === 'account-switch') { auth.user = { id: 'account-b' }; await h.render(); }
    if (change === 'logout') { auth.user = null; await h.render(); }
    if (change === 'unmount') h.unmount();
    if (change === 'reset') { f.transport.ownSnapshot = async () => { throw new Error('temporary'); }; await refresh(h); await button(await h.render(), 'Back to join').props.onClick(); }
    const count = f.calls.length; deferred.resolve(); await pending;
    if (change !== 'unmount') assert.doesNotMatch(textContent(await h.render()), /Correct!|Original A|points recorded/);
    assert.equal(f.calls.length, count);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: newer failed read supersedes hung initial restore and remains retryable', async () => {
  const f = fixture(); const delayed = defer(); let first = true; const read = f.transport.ownSnapshot;
  f.transport.ownSnapshot = b => { if (first) { first = false; return delayed.promise; } throw new Error('latest failed'); };
  const h = pageHarness(f.transport);
  try {
    const start = await h.render(); const pending = button(start, 'Reconnect my game').props.onClick(); await settle();
    f.emit(); await settle(); assert.match(textContent(await h.render()), /could not be confirmed/);
    delayed.resolve(await read(f.binding)); await pending; assert.match(textContent(await h.render()), /could not be confirmed/);
    f.transport.ownSnapshot = read; assert.equal(tiles(await refresh(h)).length, 2);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: duplicate live invalidations are reads only and cannot enable a pending answer', async () => {
  const f = fixture(); const h = pageHarness(f.transport); const delayed = defer();
  const submit = f.transport.submit; f.transport.submit = async (...args) => { await delayed.promise; return submit(...args); };
  try {
    const tree = await restore(h); const pending = tiles(tree)[0].props.onClick(); f.emit(); f.emit(); await settle();
    const busy = await h.render(); assert.ok(tiles(busy).every(e => e.props.disabled));
    await tiles(tree)[1].props.onClick(); delayed.resolve(); await pending; assert.match(textContent(await h.render()), /Correct!/);
    assert.equal(f.calls.filter(c => c[0] === 'submit').length, 1);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: expired timer does not call submit and unscored retry stays local', async () => {
  const f = fixture(); const expired = pageHarness(f.transport, undefined, { countdown: { remaining: 0, frac: 0, expired: true } });
  try { const tree = await restore(expired); assert.ok(tiles(tree).every(e => e.props.disabled)); await tiles(tree)[0].props.onClick(); assert.equal(f.calls.filter(c => c[0] === 'submit').length, 0); }
  finally { expired.unmount(); }
  await f.core.submit(f.proof, { index: 0, choice: 1 }); const h = pageHarness(f.transport);
  try {
    let tree = await restore(h); await button(tree, 'Try again, unscored').props.onClick(); tree = await h.render();
    const retry = elements(tree).find(e => e.type === 'button' && textContent(e) === 'Original A'); await retry.props.onClick();
    assert.match(textContent(await h.render()), /That matches the answer. No score changed/); assert.equal(f.calls.filter(c => c[0] === 'submit').length, 0);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: confirmed submit acknowledgement cannot be undone by unanswered snapshot', async () => {
  const f = fixture(); const h = pageHarness(f.transport);
  try {
    const oldSnapshot = await f.transport.ownSnapshot(f.binding); const tree = await restore(h);
    f.transport.ownSnapshot = async () => oldSnapshot;
    await tiles(tree)[0].props.onClick();
    const failed = await h.render(); assert.match(textContent(failed), /could not be verified for your session/);
    assert.equal(tiles(failed).length, 0); await tiles(tree)[1].props.onClick();
    assert.equal(f.calls.filter(c => c[0] === 'submit').length, 1);
    assert.equal(f.state.players.get('alice').score, 147);
  } finally { h.unmount(); }
});

test('ACTUAL JOIN: large-text learning retry is preserved and stale practice callback cannot replace newer retry', async () => {
  const f = fixture(); const h = pageHarness(f.transport);
  try {
    let tree = await restore(h); await button(tree, 'Larger text').props.onClick(); tree = await h.render();
    await tiles(tree)[1].props.onClick(); tree = await h.render();
    await button(tree, 'Try again, unscored').props.onClick(); tree = await h.render();
    const firstOption = elements(tree).find(e => e.type === 'button' && textContent(e) === 'Original A');
    assert.match(firstOption.props.className, /text-2xl/);
    const oldPractice = firstOption.props.onClick;
    f.room().currentIndex = 1; await button(tree, 'Refresh game state').props.onClick(); tree = await h.render();
    await tiles(tree)[0].props.onClick(); tree = await h.render();
    await button(tree, 'Try again, unscored').props.onClick(); tree = await h.render();
    await oldPractice(); tree = await h.render();
    assert.match(textContent(tree), /Learning check/); assert.match(textContent(tree), /Synthetic second question/);
    const newer = elements(tree).find(e => e.type === 'button' && textContent(e) === 'Second D'); assert.equal(newer.props.disabled, false);
  } finally { h.unmount(); }
});


test('ACTUAL ROUTE: explicit gate defaults to byte-identical legacy page and candidate is only opt-in', async () => {
  const jsx = { jsx: (type, props) => ({ type, props }) };
  const dependencies = { 'react/jsx-runtime': jsx, './legacy-join': { default: 'LegacyJoin' }, './secure-join': { default: 'SecureJoin' },
    '@/lib/classroom-recovery-gate': loadSourceModule('lib/classroom-recovery-gate.ts') };
  assert.equal(loadSourceModule('app/join/page.tsx', dependencies).default().type, 'LegacyJoin');
  assert.equal((await import('node:crypto')).createHash('sha256').update(sourceText('app/join/legacy-join.tsx')).digest('hex'), '655876c71ed64f9c5da39e635d0874ae759e0e974e206965478ff9d2b9475f62');
  dependencies['@/lib/classroom-recovery-gate'] = { classroomRecoveryEnabled: true };
  assert.equal(loadSourceModule('app/join/page.tsx', dependencies).default().type, 'SecureJoin');
});
