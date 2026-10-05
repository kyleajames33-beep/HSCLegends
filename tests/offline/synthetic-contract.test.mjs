import test from 'node:test';
import assert from 'node:assert/strict';
import { SyntheticClassroom } from '../support/synthetic-classroom.mjs';
import { classroomFixture as fixture } from '../fixtures/classroom.mjs';
function activeRoom() {
  const room = new SyntheticClassroom();
  const player = room.join('synthetic-student-1', 'Test Finch');
  room.start(fixture.hostId);
  return { room, player };
}
test('MODEL ONLY: host plus 30 synthetic students finish', () => {
  const room = new SyntheticClassroom();
  const students = Array.from({ length: 30 }, (_, i) => room.join(`synthetic-student-${i}`, `Test Finch ${i}`));
  room.start(fixture.hostId);
  for (const [index, q] of fixture.questions.entries()) {
    for (const s of students) room.submit(s.actor, s.id, index, q.correctIndex);
    room.advance(fixture.hostId, index);
  }
  assert.equal(room.status, 'complete'); assert.equal(room.receipts.size, 60);
  for (const s of students) assert.deepEqual(room.claim(s.actor, s.id), { awarded: 200 });
});
test('MODEL ONLY: player ownership and host authority', () => {
  const { room, player: p } = activeRoom();
  assert.throws(() => room.submit('intruder', p.id, 0, 0), /NOT_PLAYER/);
  assert.throws(() => room.resumePlayer('intruder', p.id), /NOT_PLAYER/);
  assert.throws(() => room.advance(p.actor, 0), /NOT_HOST/);
  assert.throws(() => room.resumeHost(p.actor), /NOT_HOST/);
});
test('MODEL ONLY: duplicate answer and changed answer return one receipt', () => {
  const { room, player: p } = activeRoom();
  const receipt = room.submit(p.actor, p.id, 0, 0);
  assert.deepEqual(room.submit(p.actor, p.id, 0, 1), receipt);
  assert.equal(room.players.get(p.id).score, 100);
  assert.deepEqual(room.resumePlayer(p.actor, p.id).question.receipt, receipt);
  room.advance(fixture.hostId, 0);
  assert.deepEqual(room.submit(p.actor, p.id, 0, 0), receipt);
});
test('MODEL ONLY: no answer key before submission and host can resume', () => {
  const { room, player: p } = activeRoom();
  const question = room.question(p.actor, p.id);
  assert.equal('correctIndex' in question, false); assert.equal(question.receipt, null);
  assert.deepEqual(room.resumeHost(fixture.hostId), { code: fixture.code, roomId: fixture.roomId, status: 'active', index: 0 });
});
test('MODEL ONLY: deadline, current question and choice checks', () => {
  const { room, player: p } = activeRoom();
  assert.throws(() => room.submit(p.actor, p.id, 1, 0), /STALE_QUESTION/);
  assert.throws(() => room.submit(p.actor, p.id, 0, 9), /INVALID_CHOICE/);
  room.now += fixture.secondsPerQuestion * 1000;
  assert.throws(() => room.submit(p.actor, p.id, 0, 0), /TOO_LATE/);
});
test('MODEL ONLY: repeated next cannot skip or reopen completion', () => {
  const { room } = activeRoom();
  assert.equal(room.advance(fixture.hostId, 0), true); assert.equal(room.advance(fixture.hostId, 0), false);
  assert.equal(room.index, 1);
  assert.equal(room.advance(fixture.hostId, 1), true); assert.equal(room.advance(fixture.hostId, 1), false);
  assert.equal(room.status, 'complete');
});
test('MODEL ONLY: late join preserves teams and repeat join preserves identity', () => {
  const { room, player: p } = activeRoom();
  room.join('synthetic-student-2', 'Test Wren'); room.join('synthetic-student-3', 'Test Robin');
  assert.equal(room.players.get(p.id).team, p.team);
  assert.equal(room.join(p.actor, 'Changed alias').id, p.id);
});
test('MODEL ONLY: claims require ownership and completion and are idempotent', () => {
  const { room, player: p } = activeRoom();
  assert.throws(() => room.claim(p.actor, p.id), /NOT_COMPLETE/);
  room.submit(p.actor, p.id, 0, 0); room.advance(fixture.hostId, 0); room.advance(fixture.hostId, 1);
  assert.throws(() => room.claim('intruder', p.id), /NOT_PLAYER/);
  assert.deepEqual(room.claim(p.actor, p.id), { awarded: 100 });
  assert.deepEqual(room.claim(p.actor, p.id), { awarded: 100 }); assert.equal(room.claims.size, 1);
});
