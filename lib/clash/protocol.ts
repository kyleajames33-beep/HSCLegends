// Reactor Clash network protocol (transport-agnostic).
//
// Host -> everyone: 'snap' (compact world snapshot, ~10/s) and 'roster' (names, every few seconds).
// Student -> host:  'in' (controls, on change + heartbeat), 'begin' / 'cancel' (terminal use).
// Every student message carries the player's secret token; the host ignores
// messages whose token does not match the server roster.

import { createClash, type ClashEvent, type ClashState, type Input, type Player, type Team } from './sim';

const TEAMS: Team[] = ['blue', 'orange'];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = Math.round;

type SnapPlayer = [id: string, x: number, y: number, aim: number, team: 0 | 1, alive: 0 | 1, answering: number, energy: number, streak: number, respawnAt: number, locks: number[]];
export type Snapshot = {
  t: number; e: 0 | 1; sc: [number, number];
  p: SnapPlayer[];
  r: [control: number, owner: -1 | 0 | 1][];
  sh: [x: number, y: number, vx: number, vy: number, team: 0 | 1][];
  m: [id: number, x: number, y: number, hp: number][];
  o: [id: number, x: number, y: number][];
  b: [x: number, y: number, hp: number, pulseAt: number] | null;
  ev: ClashEvent[];
};
export type Roster = [id: string, name: string, team: 0 | 1][];
export type InputMsg = { id: string; k: string; x: number; y: number; a: number; f: 0 | 1; s: 0 | 1 };
export type TerminalMsg = { id: string; k: string; term?: string };

export function encodeSnapshot(g: ClashState, events: ClashEvent[]): Snapshot {
  const termIndex = new Map(g.terminals.map((t, i) => [t.id, i]));
  return {
    t: r1(g.t), e: g.ended ? 1 : 0, sc: [r1(g.score.blue), r1(g.score.orange)],
    p: Object.values(g.players).map(p => [
      p.id, r0(p.x), r0(p.y), Math.round(p.aim * 100) / 100, p.team === 'blue' ? 0 : 1, p.alive ? 1 : 0,
      p.answering ? termIndex.get(p.answering) ?? -1 : -1, r0(p.energy), p.streak, r1(p.respawnAt),
      Object.entries(p.locks).flatMap(([id, until]) => (until > g.t ? [termIndex.get(id) ?? -1, r1(until)] : [])),
    ]),
    r: g.reactors.map(r => [Math.round(r.control * 100) / 100, r.owner === 'blue' ? 0 : r.owner === 'orange' ? 1 : -1]),
    sh: g.shots.map(s => [r0(s.x), r0(s.y), r0(s.vx), r0(s.vy), s.team === 'blue' ? 0 : 1]),
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
  for (const [id, x, y, aim, team, alive, answering, energy, streak, respawnAt, locks] of s.p) {
    const p: Player = {
      id, name: names.get(id) ?? '…', team: TEAMS[team], bot: false, x, y, aim,
      energy, streak, alive: alive === 1, respawnAt, cooldown: 0,
      answering: answering >= 0 ? terms[answering]?.id ?? null : null, locks: {},
      stats: { tags: 0, captures: 0, answered: 0, correct: 0, bossDamage: 0 },
    };
    for (let i = 0; i + 1 < locks.length; i += 2) if (terms[locks[i]]) p.locks[terms[locks[i]].id] = locks[i + 1];
    g.players[id] = p;
  }
  s.r.forEach(([control, owner], i) => { if (g.reactors[i]) { g.reactors[i].control = control; g.reactors[i].owner = owner === -1 ? null : TEAMS[owner]; } });
  g.shots = s.sh.map(([x, y, vx, vy, team], i) => ({ id: i, owner: '', team: TEAMS[team], x, y, vx, vy, ttl: 1 }));
  g.minions = s.m.map(([id, x, y, hp]) => ({ id, x, y, hp }));
  g.orbs = s.o.map(([id, x, y]) => ({ id, x, y }));
  g.boss = s.b ? { x: s.b[0], y: s.b[1], hp: s.b[2], pulseAt: s.b[3], target: 0, damage: { blue: 0, orange: 0 } } : null;
  return g;
}

/** Linear interpolation of moving things between two decoded states (for smooth remote motion). */
export function lerpState(a: ClashState, b: ClashState, k: number): ClashState {
  const out = { ...b, players: { ...b.players } };
  for (const [id, pb] of Object.entries(b.players)) {
    const pa = a.players[id];
    if (pa && pa.alive && pb.alive && Math.hypot(pa.x - pb.x, pa.y - pb.y) < 120) {
      out.players[id] = { ...pb, x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k };
    }
  }
  const mA = new Map(a.minions.map(m => [m.id, m]));
  out.minions = b.minions.map(m => { const p = mA.get(m.id); return p ? { ...m, x: p.x + (m.x - p.x) * k, y: p.y + (m.y - p.y) * k } : m; });
  if (a.boss && b.boss) out.boss = { ...b.boss, x: a.boss.x + (b.boss.x - a.boss.x) * k, y: a.boss.y + (b.boss.y - a.boss.y) * k };
  return out;
}

/** Validate a student's control message: aim/fire become a sim input; x/y a reported position. */
export function inputFromMsg(m: InputMsg): { input: Input; x: number; y: number } {
  const n = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : Number.NaN);
  const aim = n(m.a, -10, 10);
  return { input: { mx: 0, my: 0, aim: Number.isNaN(aim) ? 0 : aim, fire: m.f === 1, sprint: m.s === 1 }, x: n(m.x, 0, 1e5), y: n(m.y, 0, 1e5) };
}
