import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule } from '../support/source-harness.mjs';
import * as content from '../../prototypes/lab-tycoon/src/content.mjs';
import * as importer from '../../lib/teacher-question-import.mjs';
const rules = loadSourceModule('lib/solo-arena.ts', { '../prototypes/lab-tycoon/src/content.mjs': content, './teacher-question-import.mjs': importer });
const { initialArena, arenaReducer: reduce, questionFor, arenaRank, arenaWon, ROUND_MS, ARENA_ROUNDS } = rules;
const start = (seed = 11) => reduce(initialArena(), { type: 'start', now: 1000, seed });
const submit = (s, correct = true, now = s.deadline - 1000) => reduce(s, { type: 'answer', run: s.run, round: s.round, choice: correct ? questionFor(s).answer : (questionFor(s).answer + 1) % questionFor(s).answers.length, now });
const next = s => reduce(s, { type: 'next', run: s.run, round: s.round, now: s.deadline + 1000 });
const use = (s, power, now = s.deadline - 10000) => reduce(s, { type: 'power', run: s.run, round: s.round, power, now });

test('question selection varies by run without repeating within a full arena', () => {
  const first = Array.from(rules.arenaQuestionOrder(123));
  const second = Array.from(rules.arenaQuestionOrder(456));
  assert.deepEqual(first, Array.from(rules.arenaQuestionOrder(123)));
  assert.notDeepEqual(first, second);
  assert.equal(new Set(first).size, content.QUESTIONS.length);
  assert.equal(new Set(first.slice(0, ARENA_ROUNDS)).size, ARENA_ROUNDS);
  let state = start(123);
  const expectedId = rules.questionFor(state).id;
  state = submit(state);
  assert.equal(content.QUESTIONS[state.receipts[0].questionIndex].id, expectedId);
});

test('a teacher draft plays as a bounded solo set with its own answers and review', () => {
  const base = { options: ['First choice', 'Second choice'], correctIndex: 1, explanation: 'The second choice is correct in this synthetic example.', subject: 'biology', year: 11, module: 'module-1', syllabusVersion: '2017', source: 'Teacher-created' };
  const draft = JSON.stringify([{ ...base, id: 'one', stem: 'Synthetic question one?' }, { ...base, id: 'two', stem: 'Synthetic question two?' }]);
  let state = reduce(initialArena(), { type: 'start', now: 1_000, seed: 123, draft });
  assert.equal(state.customDraft, true); assert.equal(rules.arenaRoundLimit(state), 2);
  const firstQuestion = questionFor(state);
  const scanned = use(state, 'scan');
  assert.equal(scanned.hidden.length, 1, 'a two-option question has only one wrong answer');
  assert.equal(scanned.hidden.includes(firstQuestion.answer), false);
  state = submit(state, false);
  assert.equal(state.questions[state.receipts[0].questionIndex].stem, firstQuestion.stem);
  state = next(state);
  assert.notEqual(questionFor(state).id, firstQuestion.id);
  state = submit(state); state = next(state);
  assert.equal(state.phase, 'done'); assert.equal(state.receipts.length, 2);
  const initial = initialArena();
  assert.strictEqual(reduce(initial, { type: 'start', now: 1, seed: 1, draft: '{bad' }), initial);
  assert.strictEqual(reduce(initial, { type: 'start', now: 1, seed: 1, draft: 'x'.repeat(90_001) }), initial);
});

test('survival arena uses existing sample and bounds a complete winning run', () => {
  let state = start();
  assert.equal(state.deadline, 1000 + ROUND_MS);
  assert.equal(state.rivals.length, 5);
  for (let i = 0; i < ARENA_ROUNDS && state.phase !== 'done'; i++) { state = submit(state); state = next(state); }
  assert.equal(state.phase, 'done'); assert.equal(state.lives, 3); assert.ok(state.receipts.length <= ARENA_ROUNDS); assert.equal(arenaWon(state), true); assert.equal(arenaRank(state), 1);
});

test('misses, shield and scan create distinct energy choices without repeated spends', () => {
  let state = start();
  const shielded = use(state, 'shield');
  assert.equal(shielded.energy, 0); assert.equal(shielded.shield, true);
  assert.strictEqual(use(shielded, 'shield'), shielded);
  state = submit(shielded, false); assert.equal(state.lives, 3); assert.equal(state.receipts[0].blocked, true); assert.equal(state.energy, 0);
  state = next(state); assert.equal(state.shield, false);
  const scanned = use(start(), 'scan');
  assert.equal(scanned.hidden.length, 2); assert.equal(scanned.hidden.includes(questionFor(scanned).answer), false);
  assert.strictEqual(reduce(scanned, { type: 'answer', run: scanned.run, round: scanned.round, choice: scanned.hidden[0], now: scanned.deadline - 1000 }), scanned);
  const correct = submit(scanned); assert.equal(correct.energy, 1); assert.equal(correct.correct, 1);
});

test('deadline is enforced by answers and powers even when the timer callback is delayed', () => {
  const active = start();
  for (const type of ['answer', 'power']) {
    const action = type === 'answer' ? { type, choice: questionFor(active).answer } : { type, power: 'shield' };
    const timed = reduce(active, { ...action, run: active.run, round: active.round, now: active.deadline });
    assert.equal(timed.phase, 'reveal'); assert.equal(timed.lives, 2); assert.equal(timed.receipts[0].timeout, true); assert.equal(timed.correct, 0);
  }
  const invalidExpired = reduce(active, { type: 'answer', choice: 100, run: active.run, round: active.round, now: active.deadline + 1 });
  assert.equal(invalidExpired.receipts[0].timeout, true, 'an expired round times out even if the queued choice is invalid');
  const tick = reduce(active, { type: 'tick', run: active.run, now: active.deadline + 50000 }); assert.equal(tick.receipts.length, 1);
  assert.strictEqual(reduce(tick, { type: 'tick', run: tick.run, now: active.deadline + 60000 }), tick);
});

test('duplicate, old-round and old-run callbacks cannot change a newer arena', () => {
  const active = start(); const revealed = submit(active);
  assert.strictEqual(submit(revealed), revealed);
  const roundTwo = next(revealed);
  assert.strictEqual(reduce(roundTwo, { type: 'answer', run: active.run, round: active.round, choice: 0, now: roundTwo.deadline - 1 }), roundTwo);
  assert.strictEqual(reduce(roundTwo, { type: 'next', run: active.run, round: active.round, now: roundTwo.deadline - 1 }), roundTwo);
  const reset = reduce(roundTwo, { type: 'reset', run: roundTwo.run }); const restarted = reduce(reset, { type: 'start', now: 5000, seed: 7 });
  assert.strictEqual(reduce(restarted, { type: 'tick', run: active.run, now: 999999 }), restarted);
  assert.strictEqual(reduce(restarted, { type: 'reset', run: active.run }), restarted);
  assert.equal(restarted.receipts.length, 0); assert.equal(restarted.energy, 2); assert.equal(restarted.lives, 3);
});

test('three unprotected misses end the run and preserve review receipts', () => {
  let state = start(1);
  for (let i = 0; i < 3; i++) { state = submit(state, false); state = next(state); }
  assert.equal(state.phase, 'done'); assert.equal(state.lives, 0); assert.equal(arenaWon(state), false); assert.equal(state.receipts.length, 3); assert.ok(state.receipts.every(r => !r.correct));
  for (const r of state.receipts) assert.ok(content.QUESTIONS[r.questionIndex].explanation.length > 0);
});

test('simulated outcomes are reproducible and survival outranks eliminated rivals', () => {
  const one = submit(start(128)); const two = submit(start(128));
  assert.deepEqual(one.rivals, two.rivals);
  const rankings = { ...one, lives: 1, correct: 2, rivals: [{ lives: 0, correct: 8 }, { lives: 1, correct: 2 }, { lives: 1, correct: 3 }] };
  assert.equal(arenaRank(rankings), 2);
  assert.equal(arenaRank({ ...rankings, correct: 3 }), 1);
});

test('feedback cannot consume question time and invalid actions cannot start a run', () => {
  const initial = initialArena();
  assert.strictEqual(reduce(initial, { type: 'start', now: NaN, seed: 1 }), initial);
  assert.strictEqual(reduce(initial, { type: 'start', now: 1, seed: NaN }), initial);
  const revealed = submit(start());
  assert.strictEqual(reduce(revealed, { type: 'tick', run: revealed.run, now: 999999999 }), revealed);
  assert.strictEqual(reduce(revealed, { type: 'next', run: revealed.run, round: revealed.round, now: NaN }), revealed);
  const another = next(revealed); assert.equal(another.remaining, ROUND_MS); assert.equal(another.deadline, revealed.deadline + 1000 + ROUND_MS);
});
