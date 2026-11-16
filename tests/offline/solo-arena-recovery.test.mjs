import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule } from '../support/source-harness.mjs';
import * as content from '../../prototypes/lab-tycoon/src/content.mjs';
import * as importer from '../../lib/teacher-question-import.mjs';

const rules = loadSourceModule('lib/solo-arena.ts', { '../prototypes/lab-tycoon/src/content.mjs': content, './teacher-question-import.mjs': importer });
const recovery = loadSourceModule('lib/solo-arena-recovery.ts', { './solo-arena': rules, '../prototypes/lab-tycoon/src/content.mjs': content });
const { arenaSessionReducer: reduce, initialArenaSession, restoreArenaSession, serializeArenaSession } = recovery;
const save = session => serializeArenaSession(session.actions, session.baseRun);
const start = () => reduce(initialArenaSession(), { type: 'start', now: 1_000, seed: 123 });

test('refresh recovery keeps the current round and consumes time while away', () => {
  const started = start();
  const shielded = reduce(started, { type: 'power', power: 'shield', run: started.game.run, round: 0, now: 2_000 });
  const restored = restoreArenaSession(save(shielded), 11_000);
  assert.equal(restored.game.phase, 'round');
  assert.equal(restored.game.shield, true);
  assert.equal(restored.game.energy, 0);
  assert.equal(restored.game.remaining, 10_000);
  assert.equal(restored.game.deadline, 21_000);
});

test('an expired saved round times out once and retains the resulting receipt across refreshes', () => {
  const started = start();
  const expired = restoreArenaSession(save(started), 22_000);
  assert.equal(expired.game.phase, 'reveal');
  assert.equal(expired.game.lives, 2);
  assert.equal(expired.game.receipts.length, 1);
  assert.equal(expired.game.receipts[0].timeout, true);
  const again = restoreArenaSession(save(expired), 90_000);
  assert.equal(again.game.lives, 2);
  assert.equal(again.game.receipts.length, 1);
});

test('feedback remains paused and restores the accepted answer and standings', () => {
  const started = start();
  const answer = rules.questionFor(started.game).answer;
  const revealed = reduce(started, { type: 'answer', run: started.game.run, round: 0, choice: answer, now: 3_000 });
  const restored = restoreArenaSession(save(revealed), 800_000);
  assert.equal(restored.game.phase, 'reveal');
  assert.equal(restored.game.receipts[0].picked, answer);
  assert.equal(restored.game.correct, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.game.rivals)), JSON.parse(JSON.stringify(revealed.game.rivals)));
});

test('replay generations remain distinct and a new game discards the prior history', () => {
  const started = start();
  const reset = reduce(started, { type: 'reset', run: started.game.run });
  const replay = reduce(reset, { type: 'start', now: 2_000, seed: 987 });
  const restored = restoreArenaSession(save(replay), 3_000);
  assert.equal(restored.game.run, replay.game.run);
  assert.equal(restored.game.seed, replay.game.seed);
  assert.equal(restored.actions.length, 1);
  assert.strictEqual(reduce(restored, { type: 'answer', run: started.game.run, round: 0, choice: 0, now: 3_000 }), restored);
});

test('corrupt, incompatible, impossible and future histories are rejected', () => {
  const good = JSON.parse(save(start()));
  for (const raw of [
    '{', JSON.stringify({ ...good, version: 1 }), JSON.stringify({ ...good, content: 'different' }),
    JSON.stringify({ ...good, actions: [] }), JSON.stringify({ ...good, baseRun: -1 }),
    JSON.stringify({ ...good, actions: [...good.actions, { type: 'next', run: 1, round: 0, now: 2_000 }] }),
    JSON.stringify({ ...good, actions: [...good.actions, { type: 'power', run: 1, round: 0, power: 'unknown', now: 2_000 }] }),
    JSON.stringify({ ...good, actions: [{ type: 'start', now: 100_000, seed: 2 }] }),
    'x'.repeat(200_001),
  ]) assert.equal(restoreArenaSession(raw, 5_000), null);
});

test('clock display ticks do not add a storage event; resume cannot replace an active run', () => {
  const started = start();
  const ticked = reduce(started, { type: 'tick', run: started.game.run, now: 2_000 });
  assert.strictEqual(ticked.actions, started.actions);
  assert.strictEqual(reduce(ticked, { type: 'resume', raw: save(started), now: 3_000 }), ticked);
});

test('teacher question previews retain their own question bank and receipt after refresh', () => {
  const draft = JSON.stringify([{ id: 'teacher-1', stem: 'Synthetic teacher question?', options: ['First', 'Second'], correctIndex: 1, explanation: 'Second is correct in this test.', subject: 'physics', year: 12, module: 'module-6', syllabusVersion: '2017', source: 'Teacher-created' }]);
  const started = reduce(initialArenaSession(), { type: 'start', now: 1_000, seed: 42, draft });
  const answered = reduce(started, { type: 'answer', run: started.game.run, round: 0, choice: 0, now: 2_000 });
  const restored = restoreArenaSession(save(answered), 5_000);
  assert.equal(restored.game.customDraft, true);
  assert.equal(restored.game.questions[restored.game.receipts[0].questionIndex].stem, 'Synthetic teacher question?');
  assert.equal(restored.game.receipts[0].correct, false);
  assert.equal(restored.game.questions[0].answer, 1);
});
