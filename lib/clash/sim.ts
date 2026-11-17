// Reactor Clash: game rules as a pure, engine-free simulation.
//
// The same module runs in solo practice (in the player's browser) and, for
// multiplayer, on the host's projector, which acts as the game server. Nothing
// here touches the DOM, timers or the network. Energy comes from answering
// questions, which happens outside the sim (see beginAnswer / answerResult).

export const TILE = 48;
export const COLS = 32;
export const ROWS = 20;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export const MATCH_SECONDS = 240;
export const BOSS_AT = 60; // boss arrives with this many seconds left
export const PLAYER_R = 16;
export const SPEED = 190;
export const SPRINT_SPEED = 300;
export const SPRINT_COST = 12; // energy per second
export const SHOT_COST = 8;
export const SHOT_COOLDOWN = 0.35;
export const SHOT_SPEED = 560;
export const SHOT_TTL = 0.8;
export const MAX_ENERGY = 100;
export const START_ENERGY = 30;
export const RESPAWN_SECONDS = 4;
export const ANSWER_REWARD = 25;
export const STREAK_BONUS = 5; // per streak step, capped
export const STREAK_CAP = 4;
export const WRONG_LOCK_SECONDS = 6;
export const TERMINAL_RANGE = 56;
export const REACTOR_R = 64;
export const CAPTURE_RATE = 0.34; // control per second per player (max 3 counted)
export const MINION_EVERY = 11;
export const ORB_ENERGY = 8;
export const BOSS_HP = 80;
export const BOSS_BONUS = 60;

export type Team = 'blue' | 'orange';
export type Vec = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type Player = {
  id: string; name: string; team: Team; bot: boolean;
  x: number; y: number; aim: number;
  energy: number; streak: number;
  alive: boolean; respawnAt: number; cooldown: number;
  answering: string | null; locks: Record<string, number>;
  stats: { tags: number; captures: number; answered: number; correct: number; bossDamage: number };
};
export type Reactor = { id: string; x: number; y: number; control: number; owner: Team | null };
export type Terminal = { id: string; x: number; y: number };
export type Shot = { id: number; owner: string; team: Team; x: number; y: number; vx: number; vy: number; ttl: number };
export type Minion = { id: number; x: number; y: number; hp: number };
export type Orb = { id: number; x: number; y: number };
export type Boss = { x: number; y: number; hp: number; target: number; pulseAt: number; damage: Record<Team, number> };

export type ClashEvent =
  | { type: 'tag'; by: string; victim: string }
  | { type: 'capture'; reactor: string; team: Team }
  | { type: 'lost'; reactor: string; team: Team }
  | { type: 'minion-down'; by: string }
  | { type: 'pickup'; player: string }
  | { type: 'boss-spawn' }
  | { type: 'boss-pulse' }
  | { type: 'boss-down'; team: Team | null }
  | { type: 'answer'; player: string; correct: boolean; energy: number }
  | { type: 'end'; winner: Team | null };

export type ClashState = {
  t: number; ended: boolean; seed: number; nextId: number;
  players: Record<string, Player>;
  reactors: Reactor[]; terminals: Terminal[];
  shots: Shot[]; minions: Minion[]; orbs: Orb[];
  boss: Boss | null; bossDone: boolean; nextMinionAt: number;
  score: Record<Team, number>;
};

export type Input = { mx: number; my: number; aim: number; fire: boolean; sprint: boolean };
export const IDLE: Input = { mx: 0, my: 0, aim: 0, fire: false, sprint: false };

// ---- Map -------------------------------------------------------------------
const t = (c: number) => c * TILE;
const cell = (c: number, r: number): Vec => ({ x: t(c) + TILE / 2, y: t(r) + TILE / 2 });

/** Walls in world pixels: outer border plus symmetric cover. */
export const WALLS: Rect[] = [
  { x: 0, y: 0, w: WORLD_W, h: TILE }, { x: 0, y: WORLD_H - TILE, w: WORLD_W, h: TILE },
  { x: 0, y: 0, w: TILE, h: WORLD_H }, { x: WORLD_W - TILE, y: 0, w: TILE, h: WORLD_H },
  ...[
    [7, 6, 1, 3], [7, 11, 1, 3], [24, 6, 1, 3], [24, 11, 1, 3],
    [12, 4, 3, 1], [17, 4, 3, 1], [12, 15, 3, 1], [17, 15, 3, 1],
    [14, 8, 1, 4], [17, 8, 1, 4],
    [10, 9, 1, 2], [21, 9, 1, 2],
  ].map(([c, r, w, h]) => ({ x: t(c), y: t(r), w: t(w), h: t(h) })),
];
export const BASES: Record<Team, Rect> = {
  blue: { x: t(1), y: t(8), w: t(3), h: t(4) },
  orange: { x: t(28), y: t(8), w: t(3), h: t(4) },
};
const REACTOR_CELLS: [string, number, number][] = [['north', 16, 2], ['core', 16, 10], ['south', 16, 17]];
const TERMINAL_CELLS: [string, number, number][] = [
  ['t1', 5, 3], ['t2', 5, 16], ['t3', 26, 3], ['t4', 26, 16], ['t5', 11, 6], ['t6', 20, 13], ['t7', 11, 13], ['t8', 20, 6],
];
const MINION_SPAWNS: Vec[] = [cell(16, 1), cell(16, 18), cell(9, 1), cell(22, 18)];

// ---- Helpers ---------------------------------------------------------------
/** Small seeded PRNG (mulberry32) so a host and tests can reproduce a match. */
export function rand(state: ClashState): number {
  let a = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const other = (team: Team): Team => (team === 'blue' ? 'orange' : 'blue');

function hitsWall(x: number, y: number, r: number): boolean {
  for (const w of WALLS) {
    const nx = clamp(x, w.x, w.x + w.w), ny = clamp(y, w.y, w.y + w.h);
    if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
  }
  return false;
}
/** Move with axis-separated wall collision (slides along walls). */
function moveCircle(p: Vec, dx: number, dy: number, r: number) {
  if (!hitsWall(p.x + dx, p.y, r)) p.x += dx;
  if (!hitsWall(p.x, p.y + dy, r)) p.y += dy;
}
export function spawnPoint(team: Team, slot: number): Vec {
  const b = BASES[team];
  return { x: b.x + b.w / 2 + ((slot % 2) - 0.5) * 30, y: b.y + 30 + (slot % 4) * 40 };
}

// ---- Setup -----------------------------------------------------------------
export function createClash(seed = 1): ClashState {
  return {
    t: 0, ended: false, seed, nextId: 1,
    players: {},
    reactors: REACTOR_CELLS.map(([id, c, r]) => ({ id, ...cell(c, r), control: 0, owner: null })),
    terminals: TERMINAL_CELLS.map(([id, c, r]) => ({ id, ...cell(c, r) })),
    shots: [], minions: [], orbs: [],
    boss: null, bossDone: false, nextMinionAt: 8,
    score: { blue: 0, orange: 0 },
  };
}

export function addPlayer(state: ClashState, id: string, name: string, team: Team, bot = false): Player {
  const slot = Object.values(state.players).filter(p => p.team === team).length;
  const at = spawnPoint(team, slot);
  const p: Player = {
    id, name, team, bot, x: at.x, y: at.y, aim: team === 'blue' ? 0 : Math.PI,
    energy: START_ENERGY, streak: 0, alive: true, respawnAt: 0, cooldown: 0, answering: null, locks: {},
    stats: { tags: 0, captures: 0, answered: 0, correct: 0, bossDamage: 0 },
  };
  state.players[id] = p;
  return p;
}

// ---- Questions (energy) ----------------------------------------------------
export function terminalNear(state: ClashState, p: Player): Terminal | null {
  let best: Terminal | null = null, bestD = TERMINAL_RANGE;
  for (const term of state.terminals) { const d = dist(p, term); if (d <= bestD) { best = term; bestD = d; } }
  return best;
}
export function terminalLocked(state: ClashState, p: Player, terminalId: string): boolean {
  return (p.locks[terminalId] ?? 0) > state.t;
}
/** Start answering at a terminal. The player stands still (and is exposed) until answered. */
export function beginAnswer(state: ClashState, playerId: string, terminalId: string): boolean {
  const p = state.players[playerId], term = state.terminals.find(x => x.id === terminalId);
  if (!p || !term || state.ended || !p.alive || p.answering || dist(p, term) > TERMINAL_RANGE || terminalLocked(state, p, terminalId)) return false;
  p.answering = terminalId;
  return true;
}
/** Resolve an answer. Correct: energy (+streak bonus). Wrong: streak reset, terminal locked briefly. */
export function answerResult(state: ClashState, playerId: string, correct: boolean, events: ClashEvent[] = []): number {
  const p = state.players[playerId];
  if (!p || !p.answering) return 0;
  const term = p.answering;
  p.answering = null;
  p.stats.answered++;
  let gained = 0;
  if (correct) {
    gained = ANSWER_REWARD + STREAK_BONUS * Math.min(p.streak, STREAK_CAP);
    p.streak++;
    p.stats.correct++;
    p.energy = Math.min(MAX_ENERGY, p.energy + gained);
  } else {
    p.streak = 0;
    p.locks[term] = state.t + WRONG_LOCK_SECONDS;
  }
  events.push({ type: 'answer', player: p.id, correct, energy: gained });
  return gained;
}
export function cancelAnswer(state: ClashState, playerId: string) {
  const p = state.players[playerId];
  if (p) p.answering = null;
}

// ---- Step ------------------------------------------------------------------
function knockOut(state: ClashState, victim: Player) {
  victim.alive = false;
  victim.answering = null;
  victim.respawnAt = state.t + RESPAWN_SECONDS;
  victim.energy = Math.floor(victim.energy * 0.75);
  victim.streak = 0;
}

export function step(state: ClashState, dt: number, inputs: Record<string, Input>): ClashEvent[] {
  const events: ClashEvent[] = [];
  if (state.ended) return events;
  dt = Math.min(dt, 0.1);
  state.t += dt;
  const left = MATCH_SECONDS - state.t;
  const players = Object.values(state.players);

  // Players
  for (const p of players) {
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (!p.alive) {
      if (state.t >= p.respawnAt) {
        const at = spawnPoint(p.team, Math.floor(rand(state) * 4));
        p.x = at.x; p.y = at.y; p.alive = true;
      }
      continue;
    }
    const inp = inputs[p.id] ?? IDLE;
    p.aim = Number.isFinite(inp.aim) ? inp.aim : p.aim;
    if (p.answering) continue; // locked in place while answering
    let mx = clamp(inp.mx, -1, 1), my = clamp(inp.my, -1, 1);
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const sprinting = inp.sprint && len > 0 && p.energy > 0;
    if (sprinting) p.energy = Math.max(0, p.energy - SPRINT_COST * dt);
    const speed = sprinting ? SPRINT_SPEED : SPEED;
    moveCircle(p, mx * speed * dt, my * speed * dt, PLAYER_R);
    if (inp.fire && p.cooldown === 0 && p.energy >= SHOT_COST) {
      p.energy -= SHOT_COST;
      p.cooldown = SHOT_COOLDOWN;
      state.shots.push({ id: state.nextId++, owner: p.id, team: p.team,
        x: p.x + Math.cos(p.aim) * (PLAYER_R + 4), y: p.y + Math.sin(p.aim) * (PLAYER_R + 4),
        vx: Math.cos(p.aim) * SHOT_SPEED, vy: Math.sin(p.aim) * SHOT_SPEED, ttl: SHOT_TTL });
    }
    // Energy orbs
    for (const o of state.orbs) if (o.id > 0 && dist(p, o) < PLAYER_R + 12) {
      p.energy = Math.min(MAX_ENERGY, p.energy + ORB_ENERGY); o.id = -1; events.push({ type: 'pickup', player: p.id });
    }
  }
  state.orbs = state.orbs.filter(o => o.id > 0);

  // Shots
  for (const s of state.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.ttl -= dt;
    if (hitsWall(s.x, s.y, 4)) { s.ttl = 0; continue; }
    const shooter = state.players[s.owner];
    for (const p of players) {
      if (s.ttl <= 0 || !p.alive || p.team === s.team || dist(s, p) > PLAYER_R + 5) continue;
      s.ttl = 0;
      knockOut(state, p);
      if (shooter) shooter.stats.tags++;
      state.score[s.team] += 2;
      events.push({ type: 'tag', by: s.owner, victim: p.id });
    }
    for (const m of state.minions) {
      if (s.ttl <= 0 || m.hp <= 0 || dist(s, m) > 18) continue;
      s.ttl = 0;
      if (--m.hp <= 0) {
        state.orbs.push({ id: state.nextId++, x: m.x, y: m.y });
        events.push({ type: 'minion-down', by: s.owner });
      }
    }
    if (s.ttl > 0 && state.boss && state.boss.hp > 0 && dist(s, state.boss) < 46) {
      s.ttl = 0;
      state.boss.hp--;
      state.boss.damage[s.team]++;
      if (shooter) shooter.stats.bossDamage++;
    }
  }
  state.shots = state.shots.filter(s => s.ttl > 0);
  state.minions = state.minions.filter(m => m.hp > 0);

  // Reactors: capture by presence, drained by minions and the boss
  for (const r of state.reactors) {
    let blue = 0, orange = 0;
    for (const p of players) if (p.alive && !p.answering && dist(p, r) < REACTOR_R) { if (p.team === 'blue') blue++; else orange++; }
    if (blue && !orange) r.control -= CAPTURE_RATE * Math.min(blue, 3) * dt;
    else if (orange && !blue) r.control += CAPTURE_RATE * Math.min(orange, 3) * dt;
    let drain = 0;
    for (const m of state.minions) if (dist(m, r) < REACTOR_R) drain += 0.2;
    if (state.boss && state.boss.hp > 0 && dist(state.boss, r) < REACTOR_R + 20) drain += 0.6;
    if (drain && !(blue || orange)) r.control -= Math.sign(r.control) * Math.min(Math.abs(r.control), drain * dt);
    r.control = clamp(r.control, -1, 1);
    const prev = r.owner;
    if (r.control <= -1) r.owner = 'blue';
    else if (r.control >= 1) r.owner = 'orange';
    else if ((prev === 'blue' && r.control >= 0) || (prev === 'orange' && r.control <= 0)) r.owner = null;
    if (r.owner !== prev) {
      if (prev) events.push({ type: 'lost', reactor: r.id, team: prev });
      if (r.owner) {
        events.push({ type: 'capture', reactor: r.id, team: r.owner });
        for (const p of players) if (p.alive && p.team === r.owner && dist(p, r) < REACTOR_R) p.stats.captures++;
      }
    }
    if (r.owner) state.score[r.owner] += dt; // 1 point per second held
  }

  // Minions walk toward the nearest owned reactor (else the core) and drain it
  if (state.t >= state.nextMinionAt && left > 5) {
    const at = MINION_SPAWNS[Math.floor(rand(state) * MINION_SPAWNS.length)];
    state.minions.push({ id: state.nextId++, x: at.x, y: at.y, hp: 2 });
    state.nextMinionAt = state.t + MINION_EVERY * (left < BOSS_AT ? 0.6 : 1);
  }
  for (const m of state.minions) {
    const owned = state.reactors.filter(r => r.owner);
    const goal = (owned.length ? owned : [state.reactors[1]]).reduce((a, b) => (dist(m, a) <= dist(m, b) ? a : b));
    if (dist(m, goal) > REACTOR_R * 0.6) {
      const d = dist(m, goal) || 1;
      moveCircle(m, ((goal.x - m.x) / d) * 70 * dt, ((goal.y - m.y) / d) * 70 * dt, 12);
    }
  }

  // Boss: arrives for the final minute, roams between reactors, pulses nearby players
  if (!state.boss && !state.bossDone && left <= BOSS_AT) {
    state.boss = { ...state.reactors[1], hp: BOSS_HP, target: 0, pulseAt: state.t + 4, damage: { blue: 0, orange: 0 } };
    events.push({ type: 'boss-spawn' });
  }
  const boss = state.boss;
  if (boss && boss.hp > 0) {
    const goal = state.reactors[boss.target];
    const d = dist(boss, goal);
    if (d < 20) boss.target = (boss.target + 1) % state.reactors.length;
    else { boss.x += ((goal.x - boss.x) / d) * 45 * dt; boss.y += ((goal.y - boss.y) / d) * 45 * dt; }
    if (state.t >= boss.pulseAt) {
      boss.pulseAt = state.t + 3.5;
      for (const p of players) if (p.alive && dist(p, boss) < 110) knockOut(state, p);
      events.push({ type: 'boss-pulse' });
    }
  }
  if (boss && boss.hp <= 0 && !state.bossDone) finishBoss(state, events);

  // End of match
  if (state.t >= MATCH_SECONDS) {
    if (state.boss && !state.bossDone) finishBoss(state, events);
    state.ended = true;
    const { blue, orange } = state.score;
    events.push({ type: 'end', winner: Math.round(blue) === Math.round(orange) ? null : blue > orange ? 'blue' : 'orange' });
  }
  return events;
}

function finishBoss(state: ClashState, events: ClashEvent[]) {
  const b = state.boss!;
  state.bossDone = true;
  const top: Team | null = b.damage.blue === b.damage.orange ? null : b.damage.blue > b.damage.orange ? 'blue' : 'orange';
  if (top && b.damage[top] > 0) state.score[top] += BOSS_BONUS;
  state.boss = null;
  events.push({ type: 'boss-down', team: top });
}

export const otherTeam = other;
