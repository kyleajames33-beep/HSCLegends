// Simple bots for Reactor Clash practice (and to fill small multiplayer games).
// They refuel at terminals when low, push reactors their team does not own,
// defend reactors under attack, and shoot whatever enemy is in range.

import {
  answerResult, beginAnswer, dist, terminalLocked, IDLE, SHOT_COST, TERMINAL_RANGE, COLS, ROWS, TILE, WALLS, PLAYER_R,
  type ClashEvent, type ClashState, type Input, type Player, type Vec,
} from './sim';

type Memory = { answerAt: number; skill: number; wander: Vec | null; path: Vec[]; goalKey: string; planAt: number };
export type BotBrain = Record<string, Memory>;

const angle = (from: Vec, to: Vec) => Math.atan2(to.y - from.y, to.x - from.x);

// Walkable grid (a cell is blocked if a player-sized circle at its centre would touch a wall).
const blocked: boolean[] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
  blocked.push(WALLS.some(w => {
    const nx = Math.max(w.x, Math.min(x, w.x + w.w)), ny = Math.max(w.y, Math.min(y, w.y + w.h));
    return (x - nx) ** 2 + (y - ny) ** 2 < (PLAYER_R + 2) ** 2;
  }));
}
const cellOf = (v: Vec) => Math.min(ROWS - 1, Math.max(0, Math.floor(v.y / TILE))) * COLS + Math.min(COLS - 1, Math.max(0, Math.floor(v.x / TILE)));
const centre = (i: number): Vec => ({ x: (i % COLS) * TILE + TILE / 2, y: Math.floor(i / COLS) * TILE + TILE / 2 });

/** Breadth-first path over the tile grid (8-way, no corner cutting). */
export function findPath(from: Vec, to: Vec): Vec[] {
  const start = cellOf(from), goal = cellOf(to);
  if (start === goal) return [to];
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === goal) break;
    const cx = cur % COLS, cy = Math.floor(cur / COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const n = ny * COLS + nx;
      if (prev[n] !== -1 || (blocked[n] && n !== goal)) continue;
      if (dx && dy && (blocked[cy * COLS + nx] || blocked[ny * COLS + cx])) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  if (prev[goal] === -1) return [to];
  const path: Vec[] = [];
  for (let n = goal; n !== start; n = prev[n]) path.push(centre(n));
  path.reverse();
  path[path.length - 1] = to;
  return path;
}

function steer(p: Player, goal: Vec, sprint = false, mem?: Memory, t = 0): Input {
  let target = goal;
  if (mem) {
    const key = `${Math.round(goal.x / TILE)},${Math.round(goal.y / TILE)}`;
    if (key !== mem.goalKey || t >= mem.planAt || !mem.path.length) { mem.path = findPath(p, goal); mem.goalKey = key; mem.planAt = t + 0.6; }
    while (mem.path.length > 1 && dist(p, mem.path[0]) < TILE * 0.45) mem.path.shift();
    target = mem.path[0] ?? goal;
  }
  const d = dist(p, target) || 1;
  return { mx: (target.x - p.x) / d, my: (target.y - p.y) / d, aim: angle(p, goal), fire: false, sprint };
}

/** Inputs for every bot this tick. Also resolves bots' answers (skill = chance correct). */
export function botInputs(state: ClashState, brain: BotBrain, events: ClashEvent[], rng: () => number = Math.random): Record<string, Input> {
  const out: Record<string, Input> = {};
  const players = Object.values(state.players);
  for (const p of players) {
    if (!p.bot) continue;
    const mem = (brain[p.id] ??= { answerAt: 0, skill: 0.6 + rng() * 0.25, wander: null, path: [], goalKey: '', planAt: 0 });
    if (!p.alive) { out[p.id] = IDLE; continue; }

    // Answering at a terminal: wait a human-ish time, then resolve.
    if (p.answering) {
      if (state.t >= mem.answerAt) answerResult(state, p.id, rng() < mem.skill, events);
      out[p.id] = IDLE;
      continue;
    }

    // Shoot the closest threat in range (enemy player, minion, boss).
    const targets: Vec[] = [
      ...players.filter(o => o.alive && o.team !== p.team),
      ...state.minions,
      ...(state.boss ? [state.boss] : []),
    ];
    const threat = targets.reduce<Vec | null>((best, o) => (dist(p, o) < 320 && (!best || dist(p, o) < dist(p, best)) ? o : best), null);

    let input: Input;
    if (p.energy < SHOT_COST * 2) {
      // Refuel: nearest unlocked terminal
      const term = state.terminals.filter(t => !terminalLocked(state, p, t.id)).reduce((a, b) => (dist(p, a) <= dist(p, b) ? a : b));
      if (dist(p, term) <= TERMINAL_RANGE - 8 && beginAnswer(state, p.id, term.id)) {
        mem.answerAt = state.t + 2 + rng() * 3;
        out[p.id] = IDLE;
        continue;
      }
      input = steer(p, term, p.energy > 2 && dist(p, term) > 200, mem, state.t);
    } else {
      const attacked = state.reactors.find(r => r.owner === p.team && (state.minions.some(m => dist(m, r) < 120) || players.some(o => o.alive && o.team !== p.team && dist(o, r) < 120)));
      const wanted = state.reactors.filter(r => r.owner !== p.team);
      const goal = state.boss ?? attacked ?? (wanted.length ? wanted.reduce((a, b) => (dist(p, a) <= dist(p, b) ? a : b)) : null);
      if (goal) input = steer(p, goal, dist(p, goal) > 260 && p.energy > 40, mem, state.t);
      else {
        if (!mem.wander || dist(p, mem.wander) < 30) mem.wander = { x: 200 + rng() * 1100, y: 120 + rng() * 700 };
        input = steer(p, mem.wander, false, mem, state.t);
      }
      // Hold position on a reactor while capturing.
      const onReactor = state.reactors.find(r => r.owner !== p.team && dist(p, r) < 40);
      if (onReactor) { input.mx *= 0.1; input.my *= 0.1; }
    }
    if (threat) { input.aim = angle(p, threat) + (rng() - 0.5) * 0.25; input.fire = p.energy >= SHOT_COST; }
    out[p.id] = input;
  }
  return out;
}
