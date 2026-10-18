// LOCAL REVIEW CANDIDATE. No production transport, credential issuer, or routes.
// IDs and principalId are response-binding checks, never authorization credentials.
export type Binding = { sessionId: string; playerId: string; principalId: string | null };
export type Receipt = {
  questionIndex: number; acceptedChoice: number; isCorrect: boolean; points: number;
  answeredAt: number; correctIndex: number | null; contentRevision: string | null;
  keyProvenance: 'frozen' | 'legacy-unavailable';
};
export type Snapshot = Binding & {
  schemaVersion: 1; status: 'lobby' | 'active' | 'complete'; index: number;
  total: number | null; startedAt: number | null; durationMs: number | null; isDouble: boolean;
  question: { stem: string; options: string[]; contentRevision: string } | null;
  contentStatus: 'current-session' | 'frozen' | 'historical-content-unavailable';
  ownReceipt: Receipt | null;
};
export type Standing = Binding & { schemaVersion: 1; rank: number; score: number };
export type Transport = {
  enabled: boolean;
  // join creates a guest-capable session grant. restore uses an already issued
  // server credential, NOT alias/code/player ID or a browser answer receipt.
  join(input: { code: string; alias: string }): Promise<unknown>;
  restore(): Promise<unknown>;
  ownSnapshot(binding: Binding): Promise<unknown>;
  submit(binding: Binding, answer: { index: number; choice: number }): Promise<unknown>;
  ownStanding(binding: Binding): Promise<unknown>;
  // Notifications are only invalidation hints. No roster or answer data trusted.
  watch?(binding: Binding, changed: () => void): () => void;
};
const disconnected = async (): Promise<never> => { throw new Error('integration-unavailable'); };
// Intentionally not configurable by environment variables or browser globals.
// Replace only after the reviewed server adapter and security gates are satisfied.
export const classroomTransport: Transport = Object.freeze({
  enabled: false, join: disconnected, restore: disconnected,
  ownSnapshot: disconnected, submit: disconnected, ownStanding: disconnected,
});

class InvalidResponse extends Error {}
const invalid = (): never => { throw new InvalidResponse('Invalid owned response'); };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
};
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
export function checkedBinding(value: unknown, principalId: string | null): Binding {
  const v = object(value);
  if (!nonempty(v.sessionId) || !nonempty(v.playerId) || v.principalId !== principalId) return invalid();
  return { sessionId: v.sessionId, playerId: v.playerId, principalId };
}
function bound(value: unknown, binding: Binding): Record<string, unknown> {
  const v = object(value);
  const got = checkedBinding(value, binding.principalId);
  if (v.schemaVersion !== 1 || got.sessionId !== binding.sessionId || got.playerId !== binding.playerId) return invalid();
  return v;
}
function checkedReceipt(value: unknown, index: number): Receipt {
  const r = object(value);
  if (r.questionIndex !== index || !integer(r.acceptedChoice) || typeof r.isCorrect !== 'boolean'
    || !integer(r.points) || !integer(r.answeredAt)
    || (!r.isCorrect && r.points !== 0)) return invalid();
  if (r.keyProvenance === 'frozen') {
    if (!integer(r.correctIndex) || !nonempty(r.contentRevision)) return invalid();
    if ((r.acceptedChoice === r.correctIndex) !== r.isCorrect) return invalid();
  } else if (r.keyProvenance !== 'legacy-unavailable' || r.correctIndex !== null || r.contentRevision !== null) return invalid();
  return { questionIndex: index, acceptedChoice: r.acceptedChoice, isCorrect: r.isCorrect,
    points: r.points, answeredAt: r.answeredAt, correctIndex: r.correctIndex as number | null,
    contentRevision: r.contentRevision as string | null, keyProvenance: r.keyProvenance };
}
export function checkedSnapshot(value: unknown, binding: Binding): Snapshot {
  const v = bound(value, binding);
  if ((v.total !== null && !integer(v.total, 1)) || !integer(v.index, -1) || (typeof v.total === 'number' && v.index > v.total)
    || (v.durationMs !== null && !integer(v.durationMs, 1)) || typeof v.isDouble !== 'boolean'
    || (v.startedAt !== null && !integer(v.startedAt))
    || !['lobby', 'active', 'complete'].includes(v.status as string)) return invalid();
  if (v.status === 'active' && (v.index < 0 || (typeof v.total === 'number' && v.index >= v.total))) return invalid();
  if (v.status === 'lobby' && (v.index !== -1 || v.ownReceipt !== null)) return invalid();
  const receipt = v.ownReceipt === null ? null : checkedReceipt(v.ownReceipt, v.index);
  let question: Snapshot['question'] = null;
  if (v.question !== null) {
    const q = object(v.question);
    if (typeof q.stem !== 'string' || !q.stem.trim() || !Array.isArray(q.options) || q.options.length < 2
      || !q.options.every(o => typeof o === 'string') || !nonempty(q.contentRevision)) return invalid();
    question = { stem: q.stem, options: [...q.options] as string[], contentRevision: q.contentRevision };
  }
  if (receipt?.keyProvenance === 'legacy-unavailable') {
    if (v.contentStatus !== 'historical-content-unavailable' || question !== null) return invalid();
  } else if (receipt) {
    if (v.contentStatus !== 'frozen' || !question || receipt.contentRevision !== question.contentRevision
      || receipt.correctIndex === null || receipt.correctIndex >= question.options.length
      || receipt.acceptedChoice >= question.options.length) return invalid();
  } else if (v.contentStatus !== 'current-session' || (v.status === 'active' && (!question || v.total === null || v.startedAt === null || v.durationMs === null))) return invalid();
  return { ...binding, schemaVersion: 1, status: v.status as Snapshot['status'],
    index: v.index, total: v.total as number | null, startedAt: v.startedAt as number | null, durationMs: v.durationMs as number | null,
    isDouble: v.isDouble, question, contentStatus: v.contentStatus as Snapshot['contentStatus'], ownReceipt: receipt };
}
export function checkedStanding(value: unknown, binding: Binding): Standing {
  const v = bound(value, binding);
  if (!integer(v.rank, 1) || !integer(v.score)) return invalid();
  return { ...binding, schemaVersion: 1, rank: v.rank, score: v.score };
}
export type View = {
  epoch: number; identity: string | null; known: boolean; binding: Binding | null;
  phase: 'form' | 'connecting' | 'lobby' | 'question' | 'answered' | 'finishing' | 'complete' | 'unavailable';
  busy: boolean; snapshot: Snapshot | null; standing: Standing | null; error: string; notice: string;
};
const empty = (epoch: number, identity: string | null, known: boolean): View => ({
  epoch, identity, known, binding: null, phase: 'form', busy: false, snapshot: null, standing: null, error: '', notice: '',
});
const errorText = (e: unknown) => e instanceof InvalidResponse
  ? 'This response could not be verified for your session. Reconnect securely to continue.'
  : 'Game state could not be confirmed. Your recovery data has not been removed. Retry when the connection is available.';

export class ClassroomRecoveryController {
  private view = empty(0, null, false);
  private listeners = new Set<() => void>();
  private mounted = false;
  private readVersion = 0;
  private highestIndex = -1;
  private completedObserved = false;
  private accepted: { index: number; receipt: string } | null = null;
  private answerPending: object | null = null;
  private stopWatch: (() => void) | undefined;
  constructor(private readonly transport: Transport) {}
  getSnapshot = (): View => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<View>) { this.view = { ...this.view, ...patch }; this.listeners.forEach(f => f()); }
  mount() { this.mounted = true; }
  dispose() { this.mounted = false; this.stopWatch?.(); this.stopWatch = undefined; this.readVersion++; this.answerPending = null; this.view = empty(this.view.epoch + 1, this.view.identity, false); }
  setIdentity(identity: string | null, loading: boolean) {
    if (loading || !this.view.known || this.view.identity !== identity) {
      this.stopWatch?.(); this.stopWatch = undefined; this.readVersion++; this.answerPending = null; this.highestIndex = -1; this.completedObserved = false; this.accepted = null;
      this.publish(empty(this.view.epoch + 1, identity, !loading));
    }
  }
  private current(epoch: number) { return this.mounted && this.view.known && this.view.epoch === epoch; }
  private connected(view: View) { return this.current(view.epoch) && !!view.binding && this.view.binding === view.binding; }
  private enabled() { return this.transport.enabled && this.mounted && this.view.known; }
  reset() {
    this.stopWatch?.(); this.stopWatch = undefined; this.readVersion++; this.answerPending = null; this.highestIndex = -1; this.completedObserved = false; this.accepted = null;
    this.publish(empty(this.view.epoch + 1, this.view.identity, this.view.known));
  }
  async join(code: string, alias: string) {
    if (!this.enabled() || this.view.busy || !/^[A-Z0-9]{6}$/.test(code) || !alias.trim() || alias.trim().length > 20) return;
    await this.connect(() => this.transport.join({ code, alias: alias.trim() }));
  }
  async restore() {
    if (!this.enabled() || this.view.busy) return;
    await this.connect(() => this.transport.restore());
  }
  private async connect(run: () => Promise<unknown>) {
    this.reset(); const epoch = this.view.epoch; const identity = this.view.identity;
    this.publish({ phase: 'connecting', busy: true });
    try {
      const response = await run();
      if (!this.current(epoch)) return;
      const binding = checkedBinding(response, identity);
      this.publish({ binding });
      const connected = this.view;
      this.stopWatch = this.transport.watch?.(binding, () => { if (this.connected(connected)) void this.refresh(connected); });
      await this.refresh(connected);
    } catch (e) {
      if (this.current(epoch)) this.publish({ phase: 'form', busy: false, error: errorText(e) });
    }
  }
  async refresh(view: View) {
    if (!this.enabled() || !this.connected(view)) return;
    const binding = view.binding!; const version = ++this.readVersion;
    const current = () => this.connected(view) && version === this.readVersion;
    // A refresh never enables submission while a submit may have committed.
    this.publish({ busy: true, error: '' });
    try {
      const raw = await this.transport.ownSnapshot(binding);
      if (!current()) return;
      const snapshot = checkedSnapshot(raw, binding);
      // No fabricated server revision: latest-read generation, non-regressing
      // session index/status, and immutable receipts guard observed state.
      if (snapshot.index < this.highestIndex || (this.completedObserved && snapshot.status !== 'complete')) throw new InvalidResponse('State regressed');
      if (snapshot.status !== 'complete' && this.accepted?.index === snapshot.index && this.accepted.receipt !== JSON.stringify(snapshot.ownReceipt)) throw new InvalidResponse('Receipt changed');
      this.highestIndex = snapshot.index;
      if (snapshot.ownReceipt) this.accepted = { index: snapshot.index, receipt: JSON.stringify(snapshot.ownReceipt) };
      if (snapshot.status === 'complete') {
        this.completedObserved = true;
        this.publish({ phase: 'finishing', snapshot, standing: null });
        const rawStanding = await this.transport.ownStanding(binding);
        if (!current()) return;
        const standing = checkedStanding(rawStanding, binding);
        this.publish({ phase: 'complete', standing, busy: false, notice: '' });
      } else {
        this.publish({ snapshot, standing: null, phase: snapshot.status === 'lobby' ? 'lobby' : snapshot.ownReceipt ? 'answered' : 'question',
          busy: this.answerPending !== null, notice: snapshot.ownReceipt ? 'Your accepted answer was confirmed by the server.' : '' });
      }
    } catch (e) {
      if (current()) this.publish({ phase: 'unavailable', busy: false, snapshot: null, standing: null, error: errorText(e), notice: '' });
    }
  }
  async answer(view: View, choice: number) {
    const snapshot = this.view.snapshot;
    if (!this.enabled() || !this.connected(view) || this.view.busy || this.answerPending
      || this.view.phase !== 'question' || !snapshot?.question || view.snapshot !== snapshot
      || !integer(choice) || choice >= snapshot.question.options.length) return;
    const index = snapshot.index; const pending = {}; this.answerPending = pending;
    // A pre-submit read must never overwrite the receipt fetched after submission.
    this.readVersion++;
    this.publish({ busy: true, error: '' });
    let failed = false;
    try {
      const response = await this.transport.submit(view.binding!, { index, choice });
      if (!this.connected(view)) return;
      const ack = bound(response, view.binding!);
      const receipt = checkedReceipt(ack.ownReceipt, index); // May be an earlier committed choice on replay.
      const accepted = JSON.stringify(receipt);
      if (this.accepted?.index === index && this.accepted.receipt !== accepted) throw new InvalidResponse('Receipt changed');
      // A confirmed immutable acknowledgement must not be undone by an
      // unanswered snapshot. Do not replace evidence for a newer question.
      if (!this.accepted || index >= this.accepted.index) this.accepted = { index, receipt: accepted };
    } catch {
      failed = true; // Unknown outcome: recover own authoritative state, never resubmit automatically.
    } finally {
      if (this.answerPending === pending) this.answerPending = null;
    }
    if (!this.connected(view)) return;
    await this.refresh(view);
    if (this.connected(view) && failed && this.view.phase === 'question' && this.view.snapshot?.index === index) {
      this.publish({ notice: 'No accepted answer was found in the latest server state. You can choose an answer again while the question is open.' });
    }
  }
}
