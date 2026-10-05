import type { Player } from './live';

// Client checks over existing response fields. These are not server receipts,
// authorization, idempotency, scientific review or a new scoring policy.
export function finalStanding(players: Player[], playerId: string) {
  const me = players.find((player) => player.id === playerId);
  if (!me || !Number.isFinite(me.score)) throw new Error('Your final score is not available yet. Your saved game is kept. Retry loading results.');
  if (players.some((player) => !Number.isFinite(player.score))) throw new Error('The final scoreboard is incomplete. Retry loading results.');
  return { rank: 1 + players.filter((player) => player.score > me.score).length, score: me.score };
}

export function checkedReceipt(value: { is_correct: boolean; correct_index: number; points: number }, choice: number, optionCount: number) {
  if (!value || typeof value.is_correct !== 'boolean' || !Number.isInteger(value.correct_index)
      || value.correct_index < 0 || value.correct_index >= optionCount || !Number.isFinite(value.points) || value.points < 0
      || value.is_correct !== (choice === value.correct_index)) {
    throw new Error('The answer response could not be confirmed. It may have reached the server; ask the host before retrying.');
  }
  return { is_correct: value.is_correct, correct_index: value.correct_index, points: value.points };
}

export type AnswerCounts = { answered: number; total: number; correct: number };
export type QuestionObservation = AnswerCounts & { sessionId: string; index: number; stem: string; observedAt: number };
export function validAnswerCounts(value: AnswerCounts) {
  return value && [value.answered, value.total, value.correct].every((n) => Number.isInteger(n) && n >= 0)
    && value.correct <= value.answered; // total is recently present, not all who submitted.
}
export function recordObservation(previous: QuestionObservation[], next: QuestionObservation) {
  if (!validAnswerCounts(next) || !Number.isInteger(next.index) || next.index < 0 || !Number.isFinite(next.observedAt)) return previous;
  const current = previous.filter((row) => row.sessionId === next.sessionId);
  const old = current.find((row) => row.index === next.index);
  if (old && old.observedAt > next.observedAt) return current;
  return [...current.filter((row) => row.index !== next.index), { ...next }].sort((a, b) => a.index - b.index);
}
