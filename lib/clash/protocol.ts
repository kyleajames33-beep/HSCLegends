// Reactor Clash network protocol (transport-agnostic).
//
// Host -> everyone: 'snap' (compact world snapshot, ~10/s) and 'roster' (names, every few seconds).
// Student -> host:  'in' (controls, on change + heartbeat), 'begin' / 'cancel' (terminal use).
// Every student message carries the player's secret token; the host ignores
// messages whose token does not match the server roster.

import { createClash, EMERGENCY, moveCircle, PLAYER_R, SPRINT_SPEED, type Vec, type ClashEvent, type ClashState, type Input, type Player, type Team } from './sim';

const TEAMS: Team[] = ['blue', 'orange'];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = Math.round;

type SnapPlayer = [id: string, x: number, y: number, aim: number, team: 0 | 1, alive: 0 | 1, answering: number, energy: number, streak: number, respawnAt: number, locks: number[], reportSeq?: number];
export type Snapshot = {
  t: number; e: 0 | 1; sc: [number, number];
  p: SnapPlayer[];
  r: [control: number, owner: -1 | 0 | 1][];
  sh: [x: number, y: number, vx: number, vy: number, team: 0 | 1, id?: number][];
  m: [id: number, x: number, y: number, hp: number][];
  o: [id: number, x: number, y: number][];
  b: [x: number, y: number, hp: number, pulseAt: number] | null;
  ev: ClashEvent[];
};
export const PROJECTOR_TIMEOUT_MS = 1500;
export type Roster = [id: string, name: string, team: 0 | 1][];
export type InputMsg = { id: string; k: string; x: number; y: number; a: number; f: 0 | 1; s: 0 | 1; seq?: number; life?: number };
export type TerminalMsg = { id: string; k: string; term?: string };

export function encodeSnapshot(g: ClashState, events: ClashEvent[]): Snapshot {
  const termIndex = new Map(g.terminals.map((t, i) => [t.id, i]));
  return {
    t: Math.round(g.t * 1000) / 1000, e: g.ended ? 1 : 0, sc: [r1(g.score.blue), r1(g.score.orange)],
    p: Object.values(g.players).map(p => [
      p.id, r0(p.x), r0(p.y), Math.round(p.aim * 100) / 100, p.team === 'blue' ? 0 : 1, p.alive ? 1 : 0,
      p.answering === EMERGENCY ? -2 : termIndex.get(p.answering ?? '') ?? -1, Math.ceil(p.energy * 100) / 100, p.streak, r1(p.respawnAt),
      Object.entries(p.locks).flatMap(([id, until]) => (until > g.t ? [termIndex.get(id) ?? -1, r1(until)] : [])),
      p.reportSeq ?? 0,
    ]),
    r: g.reactors.map(r => [Math.round(r.control * 100) / 100, r.owner === 'blue' ? 0 : r.owner === 'orange' ? 1 : -1]),
    sh: g.shots.map(s => [r0(s.x), r0(s.y), r0(s.vx), r0(s.vy), s.team === 'blue' ? 0 : 1, s.id]),
    m: g.minions.map(m => [m.id, r0(m.x), r0(m.y), m.hp]),
    o: g.orbs.map(o => [o.id, r0(o.x), r0(o.y)]),
    b: g.boss ? [r0(g.boss.x), r0(g.boss.y), g.boss.hp, r1(g.boss.pulseAt)] : null,
    ev: events.filter(e => e.type !== 'answer' && e.type !== 'pickup'),
  };
}

export function encodeRoster(g: ClashState): Roster {
  return Object.values(g.players).map(p => [p.id, p.name, p.team === 'blue' ? 0 : 1]);
}

/** Rebuild a renderable state from a snapshot (static map pieces come from createClash). */
export function decodeSnapshot(s: Snapshot, names: Map<string, string>): ClashState {
  const g = createClash(0);
  const terms = g.terminals;
  g.t = s.t; g.ended = s.e === 1;
  g.score = { blue: s.sc[0], orange: s.sc[1] };
  for (const [id, x, y, aim, team, alive, answering, energy, streak, respawnAt, locks, reportSeq] of s.p) {
    const p: Player = {
      id, name: names.get(id) ?? '…', team: TEAMS[team], bot: false, x, y, aim,
      energy, streak, alive: alive === 1, respawnAt, reportSeq, cooldown: 0,
      answering: answering === -2 ? EMERGENCY : answering >= 0 ? terms[answering]?.id ?? null : null, locks: {},
      stats: { tags: 0, captures: 0, answered: 0, correct: 0, bossDamage: 0 },
    };
    for (let i = 0; i + 1 < locks.length; i += 2) if (terms[locks[i]]) p.locks[terms[locks[i]].id] = locks[i + 1];
    g.players[id] = p;
  }
  s.r.forEach(([control, owner], i) => { if (g.reactors[i]) { g.reactors[i].control = control; g.reactors[i].owner = owner === -1 ? null : TEAMS[owner]; } });
  g.shots = s.sh.map(([x, y, vx, vy, team, id], i) => ({ id: id ?? -1 - i, owner: '', team: TEAMS[team], x, y, vx, vy, ttl: 1 }));
  g.minions = s.m.map(([id, x, y, hp]) => ({ id, x, y, hp }));
  g.orbs = s.o.map(([id, x, y]) => ({ id, x, y }));
  g.boss = s.b ? { x: s.b[0], y: s.b[1], hp: s.b[2], pulseAt: s.b[3], target: 0, damage: { blue: 0, orange: 0 } } : null;
  return g;
}

/** Blend two samples, or project from the newer sample when k > 1. */
function movingPosition(a: Vec, b: Vec, k: number, seconds: number, radius: number): Vec {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (k <= 1) return { x: a.x + dx * k, y: a.y + dy * k };
  // Bursty input reports can imply implausible velocities. Bound projected travel
  // and use the same wall collision as movement for players and minions.
  const factor = (k - 1) * Math.min(1, SPRINT_SPEED * seconds / (Math.hypot(dx, dy) || 1));
  const position = { x: b.x, y: b.y };
  if (radius) moveCircle(position, dx * factor, dy * factor, radius);
  else { position.x += dx * factor; position.y += dy * factor; }
  return position;
}

export function lerpState(a: ClashState, b: ClashState, k: number): ClashState {
  const projecting = k > 1;
  const base = projecting ? b : a;
  const seconds = b.t - a.t;
  if (k === 1 || b.ended) return b;
  const out = { ...base, t: a.t + seconds * k, players: { ...base.players } };
  for (const p of Object.values(base.players)) {
    const from = a.players[p.id], to = b.players[p.id];
    if (from?.alive && to?.alive && from.respawnAt === to.respawnAt && !(projecting && to.answering)
        && Math.hypot(from.x - to.x, from.y - to.y) < 120) {
      out.players[p.id] = { ...p, ...movingPosition(from, to, k, seconds, PLAYER_R) };
    }
  }
  const others = new Map((projecting ? a : b).minions.map(m => [m.id, m]));
  out.minions = base.minions.map(m => {
    const other = others.get(m.id);
    if (!other) return m;
    const pos = projecting ? movingPosition(other, m, k, seconds, 12) : movingPosition(m, other, k, seconds, 12);
    return { ...m, ...pos };
  });
  if (base.boss && a.boss && b.boss) out.boss = { ...base.boss, ...movingPosition(a.boss, b.boss, k, seconds, 0) };
  // Only interpolate confirmed paths. A shot may hit cover or disappear before
  // the next sample, and its old array slot may already belong to another shot.
  if (!projecting) {
    const nextShots = new Map(b.shots.map(s => [s.id, s]));
    out.shots = a.shots.map(s => {
      const next = s.id >= 0 && nextShots.get(s.id);
      return next ? { ...s, x: s.x + (next.x - s.x) * k, y: s.y + (next.y - s.y) * k } : s;
    });
  }
  return out;
}

type TimedSnapshot = { g: ClashState; at: number; playAt: number };

/** The receipt timestamp drives liveness. The host timeline drives remote animation. */
export class SnapshotBuffer {
  private history: TimedSnapshot[] = [];

  get latest() { return this.history.at(-1); }

  push(g: ClashState, at: number) {
    const previous = this.latest;
    let playAt = at;
    if (previous) {
      const interval = (g.t - previous.g.t) * 1000;
      if (interval === 0) {
        previous.g = g;
        previous.at = at;
        return;
      }
      if (interval < 0 || interval > 500 || at - previous.at > 500) {
        this.history = [];
      } else {
        // Preserve spacing even when packets arrive together. Slowly track clock drift.
        const expected = previous.playAt + interval;
        playAt = expected + Math.max(-2, Math.min(2, (at - expected) * 0.05));
      }
    }
    this.history.push({ g, at, playAt });
    if (this.history.length > 5) this.history.shift();
  }

  sample(now: number): ClashState | undefined {
    const first = this.history[0], last = this.latest;
    if (!first || !last) return;
    const renderAt = now - 150;
    if (this.history.length === 1 || renderAt <= first.playAt) return first.g;
    for (let i = 1; i < this.history.length; i++) {
      const a = this.history[i - 1], b = this.history[i];
      if (renderAt <= b.playAt) return lerpState(a.g, b.g, (renderAt - a.playAt) / (b.playAt - a.playAt));
    }
    const previous = this.history[this.history.length - 2];
    const ahead = Math.min(renderAt - last.playAt, 65);
    return lerpState(previous.g, last.g, 1 + ahead / (last.playAt - previous.playAt));
  }
}

/** Validate a student's control message: aim/fire become a sim input; x/y a reported position. */
export function inputFromMsg(m: InputMsg): { input: Input; x: number; y: number } {
  const n = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : Number.NaN);
  const aim = n(m.a, -10, 10);
  return { input: { mx: 0, my: 0, aim: Number.isNaN(aim) ? 0 : aim, fire: m.f === 1, sprint: m.s === 1 }, x: n(m.x, 0, 1e5), y: n(m.y, 0, 1e5) };
}
