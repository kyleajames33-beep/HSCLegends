/** Staging-only snapshot polling. The caller owns the client and auth lifecycle. */
export type PollingStatus = 'connecting' | 'live' | 'retrying' | 'stalled';
export type SnapshotPoller = { start(): void; refresh(): void; dispose(): void };
type Timer = ReturnType<typeof setTimeout>;
type PollOptions<T> = {
  read: () => Promise<T | null>;
  onSnapshot: (snapshot: T) => void;
  onStatus: (status: PollingStatus) => void;
  intervalMs?: number;
  timeoutMs?: number;
};

/**
 * Poll snapshots sequentially, with bounded backoff. An unresponsive read is
 * abandoned after timeout; at most two unresolved reads can exist. A timeout
 * requires an explicit refresh so a broken connection cannot loop forever.
 * Dispose immediately when the room, actor or auth generation changes.
 * No timer or local state grants authority or substitutes for server receipts.
 */
export function createSnapshotPoller<T>(options: PollOptions<T>): SnapshotPoller {
  const interval = options.intervalMs ?? 3000;
  const timeout = options.timeoutMs ?? 10000;
  if (!Number.isFinite(interval) || interval < 100 || interval > 60000 || !Number.isFinite(timeout) || timeout < 100 || timeout > 120000) throw new Error('INVALID_POLL_INTERVAL');
  let disposed = false, started = false, epoch = 0, unresolved = 0, failures = 0;
  let scheduled: Timer | undefined, deadline: Timer | undefined;
  const clear = () => { if (scheduled !== undefined) clearTimeout(scheduled); if (deadline !== undefined) clearTimeout(deadline); scheduled = undefined; deadline = undefined; };
  const schedule = (delay: number) => { scheduled = setTimeout(() => { scheduled = undefined; run(); }, delay); };
  const run = () => {
    if (disposed || !started) return;
    clear();
    const current = ++epoch;
    if (unresolved >= 2) { options.onStatus('stalled'); return; }
    unresolved++;
    options.onStatus(failures ? 'retrying' : 'connecting');
    deadline = setTimeout(() => {
      deadline = undefined;
      if (disposed || current !== epoch) return;
      epoch++;
      options.onStatus('stalled');
    }, timeout);
    // Promise.resolve defers synchronous exceptions and lets teardown invalidate them.
    Promise.resolve().then(() => disposed || current !== epoch ? null : options.read()).then((snapshot) => {
      if (disposed || current !== epoch) return;
      clear();
      // Null is an obsolete/superseded read, not confirmation of a live room.
      // Retry at the normal interval without announcing a successful update.
      if (snapshot === null) { options.onStatus('retrying'); if (!disposed && current === epoch) schedule(interval); return; }
      failures = 0;
      options.onSnapshot(snapshot);
      if (disposed || current !== epoch) return;
      options.onStatus('live');
      if (!disposed && current === epoch) schedule(interval);
    }, () => {
      if (disposed || current !== epoch) return;
      clear(); failures++;
      options.onStatus('retrying');
      if (!disposed && current === epoch) schedule(Math.min(interval * 2 ** Math.min(failures, 5), 30000));
    }).finally(() => { unresolved--; });
  };
  return {
    start() { if (disposed || started) return; started = true; run(); },
    refresh() { if (disposed || !started) return; run(); },
    dispose() { if (disposed) return; disposed = true; epoch++; clear(); },
  };
}
