import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';
import { createGame, startGame, nextQuestion, getLiveQuestion, fetchPlayers, subscribeGame, type Player, type LiveQuestion } from './live';
import { browserStorage, readHostRecovery, writeHostRecovery, clearHostRecovery, cacheMessage, assignProjectorTeams, type HostRecovery, type ProjectorTeams } from './live-session-cache';

type HostState = {
  phase: 'setup' | 'lobby' | 'active' | 'complete'; code: string; sessionId: string;
  players: Player[]; q: LiveQuestion | null; teams: ProjectorTeams; teamMode: boolean;
  busy: boolean; err: string; notice: string; resume: HostRecovery | null;
  ownerId: string | null; authLoading: boolean; ready: boolean;
};
const initial: HostState = { phase: 'setup', code: '', sessionId: '', players: [], q: null, teams: {}, teamMode: false, busy: false, err: '', notice: '', resume: null, ownerId: null, authLoading: true, ready: false };

// Coordinates existing client RPCs only. Account binding prevents accidental
// cross-account resume; it does not establish server authorization or ownership.
export class LiveHostController {
  private state: HostState = initial;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private refreshVersion = 0;
  private lobbyPlayersVersion = 0;
  private unsubscribe: (() => void) | null = null;
  private record: HostRecovery | null = null;
  private accountResolved = false;
  constructor(private sb: SupabaseClient, private storage = browserStorage()) {}
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<HostState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((listener) => listener()); }
  private stop() { this.unsubscribe?.(); this.unsubscribe = null; }
  private current(epoch: number, owner: string) { return epoch === this.epoch && owner === this.state.ownerId && !this.state.authLoading; }
  setAccount(ownerId: string | null, loading: boolean) {
    // Initial unresolved auth is not a logout and must not erase recovery data.
    if (loading) { if (!this.state.authLoading) this.update({ authLoading: true, ready: false }); return; }
    if (this.accountResolved && this.state.ownerId === ownerId && !this.state.authLoading) return;
    this.accountResolved = true; this.epoch++; this.stop(); this.record = null;
    const cached = readHostRecovery(this.storage);
    this.update({ ...initial, ownerId, authLoading: false, resume: cached.record, notice: cacheMessage(cached.error) });
  }
  private persist(record: HostRecovery) {
    const warning = cacheMessage(writeHostRecovery(record, this.storage));
    if (warning) this.update({ notice: warning });
  }
  async create(subject: Subject, year: 11 | 12) {
    const owner = this.state.ownerId;
    if (!owner || this.state.authLoading) { this.update({ err: 'Sign in before hosting a game.' }); return; }
    const epoch = ++this.epoch; this.stop();
    this.update({ busy: true, ready: false, err: '' });
    try {
      const game = await createGame(this.sb, subject, year, 10);
      if (!this.current(epoch, owner)) return;
      const record: HostRecovery = { version: 1, sessionId: game.session_id, code: game.code, ownerId: owner, ts: Date.now(), teams: {}, teamMode: false };
      this.record = record; this.persist(record); this.update({ resume: record });
      // Preserve the existing successful-create contract. The retained RPC
      // definition does not establish a question/status row before start.
      this.update({ code: record.code, sessionId: record.sessionId, phase: 'lobby', q: null, players: [], teams: {}, teamMode: false, ready: true });
      await this.refreshCreatedLobbyPlayers(record, epoch, owner);
      if (this.current(epoch, owner)) this.listen(record, epoch, owner);
    } catch (e) { this.fail(e, epoch, owner); }
    finally { if (this.current(epoch, owner)) this.update({ busy: false }); }
  }
  async restore() {
    const record = this.state.resume ?? this.record;
    const owner = this.state.ownerId;
    if (!record || !owner || owner !== record.ownerId || this.state.authLoading) { this.update({ err: 'Sign in with the account that created this saved game.' }); return; }
    const epoch = ++this.epoch; this.stop(); this.record = record;
    this.update({ busy: true, ready: false, err: '' });
    try { await this.attach(record, epoch, owner); }
    catch (e) { this.fail(e, epoch, owner); }
    finally { if (this.current(epoch, owner)) this.update({ busy: false }); }
  }
  private async attach(record: HostRecovery, epoch: number, owner: string) {
    // Never enable controls from cached phase, scores or round information.
    await this.refresh(record, epoch, owner);
    if (!this.current(epoch, owner) || !this.state.ready || this.state.phase === 'complete') return;
    this.listen(record, epoch, owner);
  }
  private listen(record: HostRecovery, epoch: number, owner: string) {
    this.unsubscribe = subscribeGame(this.sb, record.sessionId, {
      onPlayers: () => {
        // A room created in this lifecycle already has a confirmed lobby.
        // Player joins must not require an unverified pre-start question row.
        const work = this.state.phase === 'lobby' && this.state.q === null
          ? this.refreshCreatedLobbyPlayers(record, epoch, owner)
          : this.refresh(record, epoch, owner);
        void work.catch((e) => this.fail(e, epoch, owner));
      },
      onSession: () => { void this.refresh(record, epoch, owner).catch((e) => this.fail(e, epoch, owner)); },
    });
  }
  private async refreshCreatedLobbyPlayers(record: HostRecovery, epoch: number, owner: string) {
    if (!this.current(epoch, owner)) return;
    const version = ++this.lobbyPlayersVersion;
    let players: Player[];
    try { players = await fetchPlayers(this.sb, record.sessionId); }
    catch (e) {
      if (this.current(epoch, owner) && version === this.lobbyPlayersVersion && this.state.phase === 'lobby' && this.state.q === null) {
        this.update({ err: `Player list could not be refreshed: ${e instanceof Error ? e.message : 'read failed'}. Your created lobby is kept. Retry players.` });
      }
      return;
    }
    if (!this.current(epoch, owner) || version !== this.lobbyPlayersVersion || this.state.phase !== 'lobby' || this.state.q !== null) return;
    const currentRecord = this.record ?? record;
    const teams = assignProjectorTeams(currentRecord.teams, players);
    this.record = { ...currentRecord, teams };
    this.persist(this.record); this.update({ players, teams, resume: this.record, err: '' });
  }
  async retryPlayers() {
    const { ownerId: owner, ready, busy, phase, q } = this.state;
    if (!owner || !ready || busy || phase !== 'lobby' || q !== null || this.state.authLoading || !this.record) return;
    const epoch = this.epoch;
    this.update({ busy: true });
    try { await this.refreshCreatedLobbyPlayers(this.record, epoch, owner); }
    finally { if (this.current(epoch, owner)) this.update({ busy: false }); }
  }
  private async refresh(record: HostRecovery, epoch: number, owner: string) {
    if (!this.current(epoch, owner)) return;
    const version = ++this.refreshVersion;
    let q: LiveQuestion; let players: Player[];
    try { [q, players] = await Promise.all([getLiveQuestion(this.sb, record.sessionId), fetchPlayers(this.sb, record.sessionId)]); }
    catch (e) { if (this.current(epoch, owner) && version === this.refreshVersion) this.fail(e, epoch, owner); return; }
    if (!this.current(epoch, owner) || version !== this.refreshVersion) return;
    // An empty result is not evidence that a room was deleted. In particular,
    // the pre-start lobby response contract is absent from this repository.
    if (!q) { this.fail(new Error('Game state is unavailable. Your saved room is kept; try again.'), epoch, owner); return; }
    if (!['lobby', 'active', 'complete'].includes(q.status)) { this.fail(new Error('Saved game returned an unsupported state. Controls remain unavailable.'), epoch, owner); return; }
    const currentRecord = this.record ?? record;
    const teams = assignProjectorTeams(currentRecord.teams, players);
    const changed = JSON.stringify(teams) !== JSON.stringify(currentRecord.teams);
    this.record = { ...currentRecord, teams };
    if (q.status === 'complete') {
      const warning = cacheMessage(clearHostRecovery(this.storage));
      this.stop(); this.update({ resume: null, notice: warning || 'This game has already ended. Final scores were loaded from the server.' });
    } else if (changed) this.persist(this.record);
    this.update({ code: record.code, sessionId: record.sessionId, phase: q.status, q, players, teams, teamMode: currentRecord.teamMode, ready: true, resume: q.status === 'complete' ? null : this.record, err: '' });
  }
  private fail(error: unknown, epoch: number, owner: string) {
    if (!this.current(epoch, owner)) return;
    this.stop(); this.update({ phase: 'setup', ready: false, err: error instanceof Error ? error.message : 'Could not reconnect to the game. Try again.', resume: this.record ?? this.state.resume });
  }
  async begin() { await this.mutate('start'); }
  async advance(expectedSessionId = this.state.sessionId, expectedIndex = this.state.q?.index) {
    if (this.state.sessionId !== expectedSessionId || this.state.q?.index !== expectedIndex) return;
    await this.mutate('next');
  }
  private async mutate(kind: 'start' | 'next') {
    const { ownerId: owner, sessionId, ready, busy, phase } = this.state;
    if (!owner || !ready || busy || this.state.authLoading || !this.record || (kind === 'start' ? phase !== 'lobby' : phase !== 'active')) return;
    const epoch = this.epoch;
    this.update({ busy: true, err: '' });
    try {
      if (kind === 'start') await startGame(this.sb, sessionId); else await nextQuestion(this.sb, sessionId);
      if (this.current(epoch, owner)) await this.refresh(this.record, epoch, owner);
    } catch (e) { this.fail(e, epoch, owner); }
    finally { if (this.current(epoch, owner)) this.update({ busy: false }); }
  }
  toggleTeams() {
    if (!this.record || !this.state.ready || this.state.phase !== 'lobby') return;
    this.record = { ...this.record, teamMode: !this.state.teamMode };
    this.persist(this.record); this.update({ teamMode: this.record.teamMode, resume: this.record });
  }
  forget() {
    this.epoch++; this.stop(); this.record = null;
    const notice = cacheMessage(clearHostRecovery(this.storage));
    this.update({ ...initial, ownerId: this.state.ownerId, authLoading: this.state.authLoading, notice });
  }
  dispose() { this.epoch++; this.stop(); }
}
