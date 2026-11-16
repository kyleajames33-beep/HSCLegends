import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServerClock, estimatedSecondsRemaining } from '../../lib/classroom-v2/clock.ts';

const now = '2026-01-01T00:00:00Z';
const close = '2026-01-01T00:00:15Z';

test('server-time estimate counts down using monotonic elapsed time, clamps at zero', () => {
  const clock = makeServerClock(now, 400);
  assert.equal(estimatedSecondsRemaining(clock, close, 400), 15);
  assert.equal(estimatedSecondsRemaining(clock, close, 1401), 14);
  assert.equal(estimatedSecondsRemaining(clock, close, 15900), 0);
});

test('stale or invalid timing data requires a new snapshot', () => {
  const clock = makeServerClock(now, 400);
  assert.equal(estimatedSecondsRemaining(clock, close, 399), null);
  assert.equal(estimatedSecondsRemaining(clock, close, 60401), null);
  assert.equal(estimatedSecondsRemaining(clock, '2026-01-01T00:02:01Z', 400), null);
  assert.equal(estimatedSecondsRemaining(clock, 'bad', 400), null);
  assert.equal(makeServerClock('2026-01-01', 400), null);
  assert.equal(makeServerClock(now, NaN), null);
});
