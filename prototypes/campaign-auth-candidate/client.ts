/**
 * Staging-only adapter for the isolated campaign_api candidate. The caller must
 * select the candidate schema on the transport and update context immediately
 * when verified auth identity or run changes. No client field authenticates an
 * actor: server-side auth.uid()/grants remain the security boundary.
 */
export type CampaignPhase = 'question' | 'feedback' | 'won' | 'lost' | 'exhausted';
export type CampaignAction = 'answer' | 'expire' | 'next' | 'hit' | 'special' | 'block';
export type RpcResult = { data: unknown; error: { message?: string } | null };
export type RpcTransport = {
  rpc(name: string, args: Record<string, unknown>): { abortSignal(signal: AbortSignal): PromiseLike<RpcResult> };
};
export type QuestionView = { id: number; prompt: string; options: string[] };
export type CampaignView = {
  run: string; version: number; phase: CampaignPhase; turn: number; boss_hp: number;
  player_hp: number; energy: number; combo: number; shield: boolean; charging: boolean;
  deadline: string; question: QuestionView | null;
};
export type Receipt = { question_id: number; correct: boolean; correct_index: number; explanation: string; damage: number };
export type ActionResult = {
  run: string; request_id: string; kind: CampaignAction; expected_version: number;
  version: number; phase: CampaignPhase; turn: number; boss_hp: number; player_hp: number;
  energy: number; combo: number; shield: boolean; charging: boolean; receipt: Receipt | null;
};
type Pending = { id: string; expected: number; kind: CampaignAction; value: number | null; turn: number; phase: CampaignPhase;
  questionId: number | null; bossHp: number; playerHp: number; energy: number; combo: number; shield: boolean; charging: boolean };
export class CampaignClientError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const phase = (value: unknown): value is CampaignPhase =>
  value === 'question' || value === 'feedback' || value === 'won' || value === 'lost' || value === 'exhausted';
function id(value: unknown): string {
  if (!uuid(value)) throw new CampaignClientError('Invalid identifier.');
  return value.toLowerCase();
}
function validReceipt(value: unknown): value is Receipt {
  return object(value) && integer(value.question_id, 1) && typeof value.correct === 'boolean' &&
    integer(value.correct_index, 0, 3) && typeof value.explanation === 'string' && integer(value.damage, 0, 100);
}
function validHealth(status: CampaignPhase, boss: number, player: number): boolean {
  if (status === 'won') return boss === 0 && player > 0;
  if (status === 'lost') return player === 0 && boss > 0;
  return boss > 0 && player > 0;
}
function sameView(a: CampaignView, b: CampaignView): boolean {
  return a.run.toLowerCase() === b.run.toLowerCase() && a.version === b.version && a.phase === b.phase &&
    a.turn === b.turn && a.boss_hp === b.boss_hp && a.player_hp === b.player_hp && a.energy === b.energy &&
    a.combo === b.combo && a.shield === b.shield && a.charging === b.charging && a.deadline === b.deadline &&
    (a.question === null ? b.question === null : b.question !== null && a.question.id === b.question.id &&
      a.question.prompt === b.question.prompt && a.question.options.every((option, index) => option === b.question!.options[index]));
}
function validView(value: unknown, run: string): value is CampaignView {
  if (!object(value) || !uuid(value.run) || value.run.toLowerCase() !== run || !integer(value.version, 0) ||
      !phase(value.phase) || !integer(value.turn, 1) || !integer(value.boss_hp, 0) ||
      !integer(value.player_hp, 0, 100) || !integer(value.energy, 0, 5) || !integer(value.combo, 0) ||
      typeof value.shield !== 'boolean' || typeof value.charging !== 'boolean' ||
      typeof value.deadline !== 'string' || !Number.isFinite(Date.parse(value.deadline)) ||
      !validHealth(value.phase, value.boss_hp, value.player_hp)) return false;
  if (value.phase !== 'question') return value.question === null;
  const q = value.question;
  return object(q) && integer(q.id, 1) && typeof q.prompt === 'string' &&
    Array.isArray(q.options) && q.options.length === 4 && q.options.every(x => typeof x === 'string') &&
    !Object.hasOwn(q, 'correct_index') && !Object.hasOwn(q, 'explanation');
}
function validAction(value: unknown, run: string, p: Pending): value is ActionResult {
  if (!object(value) || !uuid(value.run) || value.run.toLowerCase() !== run || !uuid(value.request_id) ||
      value.request_id.toLowerCase() !== p.id || value.kind !== p.kind || value.expected_version !== p.expected ||
      value.version !== p.expected + 1 || !phase(value.phase) || !integer(value.turn, 1) ||
      !integer(value.boss_hp, 0) || !integer(value.player_hp, 0, 100) || !integer(value.energy, 0, 5) ||
      !integer(value.combo, 0) || typeof value.shield !== 'boolean' || typeof value.charging !== 'boolean' ||
      !validHealth(value.phase, value.boss_hp, value.player_hp)) return false;
  if (p.kind === 'answer' || p.kind === 'expire') {
    if (!validReceipt(value.receipt)) return false;
    const correct = p.kind === 'answer' && p.value === value.receipt.correct_index;
    const damage = (correct || p.shield ? 0 : p.bossHp < 12 ? 21 : 14) + (p.charging ? 30 : 0);
    return p.phase === 'question' && value.turn === p.turn && (value.phase === 'feedback' || value.phase === 'lost') &&
      value.receipt.question_id === p.questionId && value.receipt.correct === correct && value.receipt.damage === damage &&
      value.boss_hp === p.bossHp && value.player_hp === Math.max(0, p.playerHp - value.receipt.damage) &&
      value.combo === (correct ? p.combo + 1 : 0) && value.shield === (correct ? p.shield : false) && !value.charging &&
      (value.receipt.correct ? value.energy >= Math.min(5, p.energy + 1) && value.energy <= Math.min(5, p.energy + 2) : value.energy === p.energy);
  }
  if (value.receipt !== null) return false;
  if (p.kind === 'next') return p.phase === 'feedback' && value.turn === p.turn + 1 &&
    (value.phase === 'question' || value.phase === 'exhausted') && value.boss_hp === p.bossHp &&
    value.player_hp === p.playerHp && value.energy === p.energy && value.combo === p.combo && value.shield === p.shield &&
    value.charging === (value.phase === 'question' && value.turn % 3 === 0 ? true : p.charging);
  if ((p.phase !== 'question' && p.phase !== 'feedback') || value.turn !== p.turn) return false;
  const cost = p.kind === 'special' ? 3 : 1;
  if (p.energy < cost || value.energy !== p.energy - cost) return false;
  if (p.kind === 'block') return value.phase === p.phase && value.boss_hp === p.bossHp &&
    value.player_hp === Math.min(100, p.playerHp + 16) && value.shield && !value.charging && value.combo === p.combo;
  const damage = p.kind === 'special' ? 45 : p.combo >= 5 ? 28 : p.combo >= 3 ? 21 : 14;
  const bossHp = Math.max(0, p.bossHp - damage);
  return value.boss_hp === bossHp && value.player_hp === p.playerHp && value.phase === (bossHp === 0 ? 'won' : p.phase) &&
    value.combo === p.combo && value.shield === p.shield && value.charging === p.charging;
}

export class CampaignClient {
  private readonly rpc: RpcTransport;
  private generation = 0;
  private account: string | null = null;
  private run: string | null = null;
  private controller = new AbortController();
  private busy = false;
  private view: CampaignView | null = null;
  private uncertain: Pending | null = null;
  private floorVersion = 0;
  private floorTurn = 1;
  private floorTurnKnown = false;

  constructor(rpc: RpcTransport) { this.rpc = rpc; }

  /** Invalidate all outstanding work before replacing or clearing identity/run. */
  setContext(account: string | null, run: string | null): void {
    let nextAccount: string | null, nextRun: string | null;
    try {
      nextAccount = account === null ? null : id(account);
      nextRun = run === null ? null : id(run);
      if ((nextAccount === null) !== (nextRun === null)) throw new CampaignClientError('Account and run must be set together.');
    } catch (error) {
      // A malformed account-change notification must not leave the previous
      // identity or its requests active.
      this.invalidate();
      throw error;
    }
    if (nextAccount === this.account && nextRun === this.run) return;
    this.invalidate();
    this.account = nextAccount; this.run = nextRun;
  }
  private invalidate(): void {
    this.generation += 1;
    this.controller.abort();
    this.controller = new AbortController();
    this.account = null; this.run = null;
    this.busy = false; this.view = null; this.uncertain = null; this.floorVersion = 0; this.floorTurn = 1; this.floorTurnKnown = false;
  }
  dispose(): void { this.setContext(null, null); }
  get hasUncertainAction(): boolean { return this.uncertain !== null; }

  private async request<T>(name: string, args: Record<string, unknown>, validate: (value: unknown, run: string) => value is T): Promise<T> {
    const run = this.run, generation = this.generation;
    if (!this.account || !run) throw new CampaignClientError('No active account and run.');
    if (this.busy) throw new CampaignClientError('Another request is in progress.');
    this.busy = true;
    try {
      const result = await this.rpc.rpc(name, args).abortSignal(this.controller.signal);
      if (generation !== this.generation) throw new CampaignClientError('Account or run changed.');
      if (!result || result.error) throw new CampaignClientError(result?.error?.message || 'Request failed.');
      if (!validate(result.data, run)) throw new CampaignClientError('Invalid or foreign server response.');
      return result.data;
    } catch (error) {
      if (generation !== this.generation) throw new CampaignClientError('Account or run changed.');
      throw error;
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }

  async start(release: number): Promise<void> {
    if (!integer(release, 1) || !this.run) throw new CampaignClientError('Invalid release or run.');
    if (this.uncertain) throw new CampaignClientError('Resolve the pending action first.');
    const requestedRun = this.run, generation = this.generation;
    const started = await this.request('start_run', { p_run: requestedRun, p_release: release },
      (data, run): data is { run: string; release_id: number; version: number; phase: CampaignPhase } =>
        object(data) && uuid(data.run) && data.run.toLowerCase() === run && data.release_id === release && integer(data.version, 0) && phase(data.phase));
    if (generation !== this.generation) throw new CampaignClientError('Account or run changed.');
    if (started.version < this.floorVersion) throw new CampaignClientError('Stale server state.');
    if (started.version > this.floorVersion) this.floorTurnKnown = false;
    this.floorVersion = started.version;
    this.view = null;
  }

  async refresh(): Promise<CampaignView> {
    if (!this.run) throw new CampaignClientError('No active run.');
    const generation = this.generation;
    const view = await this.request('get_state', { p_run: this.run }, validView);
    if (generation !== this.generation) throw new CampaignClientError('Account or run changed.');
    // Never accept a delayed snapshot that moves the active run backwards.
    if (view.version < this.floorVersion || view.turn < this.floorTurn ||
        (this.floorTurnKnown && view.version === this.floorVersion && view.turn !== this.floorTurn)) throw new CampaignClientError('Stale server state.');
    if (this.view && view.version === this.view.version && !sameView(this.view, view)) throw new CampaignClientError('Contradictory server state.');
    this.floorVersion = view.version;
    this.floorTurn = view.turn; this.floorTurnKnown = true;
    // Keep a private snapshot: callers can mutate returned UI data without
    // altering the version or question used to validate the next response.
    this.view = { ...view, question: view.question ? { ...view.question, options: [...view.question.options] } : null };
    return view;
  }

  async lastReceipt(): Promise<Receipt | null> {
    if (!this.run) throw new CampaignClientError('No active run.');
    const generation = this.generation;
    const data = await this.request('last_receipt', { p_run: this.run },
      (value, run): value is { run: string; version: number; turn: number; receipt: Receipt | null } => object(value) && uuid(value.run) &&
        value.run.toLowerCase() === run && integer(value.version, 0) && integer(value.turn, 1) &&
        (value.receipt === null || validReceipt(value.receipt)));
    if (generation !== this.generation) throw new CampaignClientError('Account or run changed.');
    if (data.version < this.floorVersion || data.turn < this.floorTurn ||
        (this.floorTurnKnown && data.version === this.floorVersion && data.turn !== this.floorTurn)) throw new CampaignClientError('Stale or contradictory receipt.');
    if (this.view && data.version === this.view.version && this.view.phase === 'question' && data.receipt !== null) throw new CampaignClientError('Receipt arrived before an answer.');
    if (this.view && data.version === this.view.version && this.view.phase === 'feedback' && data.receipt === null) throw new CampaignClientError('Answer receipt is missing.');
    if (this.view?.question && data.turn === this.view.turn && data.receipt && data.receipt.question_id !== this.view.question.id) throw new CampaignClientError('Receipt belongs to a different question.');
    if (data.version > this.floorVersion || !this.floorTurnKnown) { this.floorVersion = data.version; this.floorTurn = data.turn; this.floorTurnKnown = true; this.view = null; }
    return data.receipt;
  }

  async act(requestId: string, kind: CampaignAction, value: number | null = null): Promise<ActionResult> {
    if (this.uncertain) throw new CampaignClientError('Resolve the pending action first.');
    if (!this.view) throw new CampaignClientError('Refresh the run before acting.');
    if (!['answer', 'expire', 'next', 'hit', 'special', 'block'].includes(kind)) throw new CampaignClientError('Invalid action.');
    if (kind === 'answer' ? !integer(value, 0, 3) : value !== null) throw new CampaignClientError('Invalid action value.');
    const p: Pending = { id: id(requestId), expected: this.view.version, kind, value, turn: this.view.turn,
      phase: this.view.phase, questionId: this.view.question?.id ?? null, bossHp: this.view.boss_hp,
      playerHp: this.view.player_hp, energy: this.view.energy, combo: this.view.combo,
      shield: this.view.shield, charging: this.view.charging };
    if ((kind === 'answer' || kind === 'expire') && (p.phase !== 'question' || p.questionId === null)) throw new CampaignClientError('No active question.');
    if (kind === 'next' && p.phase !== 'feedback') throw new CampaignClientError('Not ready to advance.');
    if (['hit', 'special', 'block'].includes(kind) && p.phase !== 'question' && p.phase !== 'feedback') throw new CampaignClientError('Battle is not active.');
    if ((kind === 'hit' || kind === 'block') && p.energy < 1 || kind === 'special' && p.energy < 3) throw new CampaignClientError('Not enough energy.');
    return this.submit(p);
  }

  async retryUncertain(): Promise<ActionResult> {
    if (!this.uncertain) throw new CampaignClientError('No uncertain action to retry.');
    return this.submit(this.uncertain);
  }

  private async submit(p: Pending): Promise<ActionResult> {
    if (!this.run) throw new CampaignClientError('No active run.');
    if (this.busy) throw new CampaignClientError('Another request is in progress.');
    // A rejected/broken/aborted response may follow a committed transaction.
    // Only the exact same request ID, version and payload may be retried.
    const generation = this.generation;
    this.uncertain = p;
    try {
      const result = await this.request('act', { p_run: this.run, p_request: p.id, p_expected: p.expected, p_kind: p.kind, p_value: p.value },
        (data, run): data is ActionResult => validAction(data, run, p));
      if (generation !== this.generation) throw new CampaignClientError('Account or run changed.');
      if (result.version < this.floorVersion || result.turn < this.floorTurn) throw new CampaignClientError('Stale action response.');
      this.floorVersion = result.version; this.floorTurn = result.turn; this.floorTurnKnown = true; this.uncertain = null; this.view = null;
      return result;
    } catch (error) {
      // Context change already discarded the old pending action. Never attach
      // that obsolete mutation to a newly selected account or run.
      if (generation === this.generation) this.uncertain = p;
      throw error;
    }
  }

  async claim(): Promise<{ run: string; awarded: number }> {
    if (!this.run || !this.view || this.view.phase !== 'won' || this.uncertain) throw new CampaignClientError('A confirmed win is required.');
    return this.request('claim', { p_run: this.run },
      (data, run): data is { run: string; awarded: number } => object(data) && uuid(data.run) &&
        data.run.toLowerCase() === run && integer(data.awarded, 0));
  }
}
