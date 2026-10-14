import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, initialState, reduceBattle } from './model.mjs';
const answer = (s, correct = true) => reduceBattle(s, { type: 'answer', choice: correct ? QUESTIONS[s.question % QUESTIONS.length].correct : (QUESTIONS[s.question % QUESTIONS.length].correct + 1) % 4 });
const charge = (s, n) => { for (let i = 0; i < n; i++) { s = answer(s); s = reduceBattle(s, { type: 'next' }); } return s; };
test('answer earns energy without automatically damaging boss; repeated answer ignored', () => {
  const s = answer(initialState()); assert.equal(s.energy, 1); assert.equal(s.bossHp, 100); assert.equal(answer(s), s);
});
test('invalid inputs and unaffordable actions leave state untouched', () => {
  const s = initialState(); for (const action of [{ type: 'answer', choice: -1 }, { type: 'answer', choice: 0.5 }, { type: 'special' }, { type: 'hit' }, { type: 'next' }, { type: 'unknown' }]) assert.equal(reduceBattle(s, action), s);
});
test('energy caps at five and combo strike spends exactly one', () => {
  const s = charge(initialState(), 8); assert.equal(s.energy, 5); const hit = reduceBattle(s, { type: 'hit' }); assert.equal(hit.energy, 4); assert.equal(hit.bossHp, 79);
});
test('special costs three energy and deals 45 damage', () => {
  const s = reduceBattle(charge(initialState(), 3), { type: 'special' }); assert.equal(s.energy, 0); assert.equal(s.bossHp, 55);
});
test('shield heals within cap, cannot be stacked, survives correct answers and absorbs one wrong answer', () => {
  let s = reduceBattle(charge(initialState(), 2), { type: 'block' }); assert.equal(s.playerHp, 100); assert.equal(s.shield, true); assert.equal(reduceBattle(s, { type: 'block' }), s);
  s = answer(s); assert.equal(s.shield, true); s = reduceBattle(s, { type: 'next' }); s = answer(s, false); assert.equal(s.playerHp, 100); assert.equal(s.shield, false); assert.equal(s.combo, 0);
});
test('five unshielded wrong answers lose; no further rewards or actions until reset', () => {
  let s = initialState(); for (let i = 0; i < 5; i++) { s = answer(s, false); s = reduceBattle(s, { type: 'next' }); }
  assert.equal(s.status, 'lost'); assert.equal(s.playerHp, 0); assert.equal(answer(s), s); assert.deepEqual(reduceBattle(s, { type: 'reset' }), initialState());
});
test('victory clamps HP and freezes further actions', () => {
  let s = initialState(); for (let i = 0; i < 3; i++) s = reduceBattle(charge(s, 3), { type: 'special' });
  assert.equal(s.status, 'won'); assert.equal(s.bossHp, 0); assert.equal(answer(s), s); assert.equal(reduceBattle(s, { type: 'hit' }), s);
});
test('every sample question has a valid unique answer set and nonempty explanation', () => {
  for (const q of QUESTIONS) { assert.equal(q.options.length, 4); assert.equal(new Set(q.options).size, 4); assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4); assert.ok(q.why.trim()); }
});
