/** Display-only clock for a server snapshot. The database decides deadlines. */
export type ServerClock = Readonly<{ serverMs: number; receivedAt: number }>;
const MAX_SNAPSHOT_AGE = 60_000;
const timestamp = (value: string): number | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/** receivedAt and future readings must use the same monotonic clock. */
export function makeServerClock(serverNow: string, receivedAt: number): ServerClock | null {
  const serverMs = timestamp(serverNow);
  if (serverMs === null || !Number.isFinite(receivedAt) || receivedAt < 0) return null;
  return Object.freeze({ serverMs, receivedAt });
}

/**
 * Estimate seconds remaining; null means a fresh snapshot is needed. Network
 * delay can make this optimistic, and it must never authorize an answer.
 */
export function estimatedSecondsRemaining(clock: ServerClock, closesAt: string, now: number): number | null {
  const close = timestamp(closesAt);
  if (close === null || !Number.isFinite(clock.serverMs) || !Number.isFinite(clock.receivedAt) || !Number.isFinite(now)) return null;
  const elapsed = now - clock.receivedAt;
  if (elapsed < 0 || elapsed > MAX_SNAPSHOT_AGE) return null;
  const remaining = close - clock.serverMs - elapsed;
  // A live question's permitted duration is at most 120 seconds in this contract.
  if (remaining > 120_000) return null;
  return Math.max(0, Math.ceil(remaining / 1000));
}
