import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule } from '../support/source-harness.mjs';

const sim = loadSourceModule('lib/clash/sim.ts');
const bots = loadSourceModule('lib/clash/bots.ts', { './sim': sim });
const { createClash, addPlayer, step, beginAnswer, answerResult, terminalNear, IDLE } = sim;

const tick = (s, seconds, inputs = {}) => { const ev = []; for (let i = 0; i < seconds * 30; i++) ev.push(...step(s, 1 / 30, inputs)); return ev; };

test('walls stop movement and players slide along them', () => {
  const s = createClash(1);
  const p = addPlayer(s, 'a', 'A', 'blue');
  tick(s, 5, { a: { ...IDLE, mx: -1 } });
  assert.ok(p.x >= sim.TILE + sim.PLAYER_R - 0.01, 'stopped by the outer wall');
});

test('correct answers grant energy with a streak bonus; wrong answers lock the terminal', () => {
  const s = createClash(1);
  const p = addPlayer(s, 'a', 'A', 'blue');
  const term = s.terminals[0];
  p.x = term.x; p.y = term.y; p.energy = 0;
  assert.equal(terminalNear(s, p).id, term.id);
  assert.ok(beginAnswer(s, 'a', term.id));
  assert.equal(answerResult(s, 'a', true), sim.ANSWER_REWARD);
  assert.ok(beginAnswer(s, 'a', term.id));
  assert.equal(answerResult(s, 'a', true), sim.ANSWER_REWARD + sim.STREAK_BONUS);
  assert.ok(beginAnswer(s, 'a', term.id));
  assert.equal(answerResult(s, 'a', false), 0);
  assert.equal(p.streak, 0);
  assert.equal(beginAnswer(s, 'a', term.id), false, 'locked after a wrong answer');
  tick(s, sim.WRONG_LOCK_SECONDS + 0.5);
  assert.ok(beginAnswer(s, 'a', term.id), 'unlocks after the timeout');
});

test('cannot answer from far away and cannot move while answering', () => {
  const s = createClash(1);
  const p = addPlayer(s, 'a', 'A', 'blue');
  assert.equal(beginAnswer(s, 'a', s.terminals[0].id), false);
  const term = s.terminals[0];
  p.x = term.x; p.y = term.y;
  beginAnswer(s, 'a', term.id);
  tick(s, 1, { a: { ...IDLE, mx: 1 } });
  assert.equal(p.x, term.x);
});

test('shots cost energy, tag enemies and score', () => {
  const s = createClash(1);
  const a = addPlayer(s, 'a', 'A', 'blue'), b = addPlayer(s, 'b', 'B', 'orange');
  a.x = 600; a.y = 330; b.x = 760; b.y = 330; a.energy = 50;
  const ev = tick(s, 1, { a: { ...IDLE, aim: 0, fire: true } });
  assert.ok(ev.some(e => e.type === 'tag' && e.victim === 'b'));
  assert.equal(b.alive, false);
  assert.equal(s.score.blue >= 2, true);
  assert.ok(a.energy < 50);
  tick(s, sim.RESPAWN_SECONDS + 0.5);
  assert.equal(b.alive, true, 'respawns');
});

test('no energy, no shooting', () => {
  const s = createClash(1);
  const a = addPlayer(s, 'a', 'A', 'blue');
  a.energy = 0;
  tick(s, 1, { a: { ...IDLE, fire: true } });
  assert.equal(s.shots.length, 0);
});

test('standing on a reactor captures it and it scores over time', () => {
  const s = createClash(1);
  const a = addPlayer(s, 'a', 'A', 'blue');
  const r = s.reactors[0];
  a.x = r.x; a.y = r.y;
  const ev = tick(s, 4);
  assert.equal(r.owner, 'blue');
  assert.ok(ev.some(e => e.type === 'capture' && e.team === 'blue'));
  const before = s.score.blue;
  a.x = 300; a.y = 300;
  tick(s, 5);
  assert.ok(s.score.blue - before >= 4.5, 'holding scores about 1/s');
});

test('contested reactors do not change hands', () => {
  const s = createClash(1);
  const a = addPlayer(s, 'a', 'A', 'blue'), b = addPlayer(s, 'b', 'B', 'orange');
  const r = s.reactors[1];
  a.x = r.x - 10; a.y = r.y; b.x = r.x + 10; b.y = r.y;
  tick(s, 5);
  assert.equal(r.owner, null);
});

test('minions spawn, and the boss arrives for the final minute', () => {
  const s = createClash(3);
  addPlayer(s, 'a', 'A', 'blue');
  const ev = tick(s, sim.MATCH_SECONDS - sim.BOSS_AT + 1);
  assert.ok(s.minions.length > 0 || ev.some(e => e.type === 'minion-down'));
  assert.ok(ev.some(e => e.type === 'boss-spawn'));
  assert.ok(s.boss);
});

test('a full bot-vs-bot match plays out, ends, and both sides do things', () => {
  for (const seed of [1, 2, 3]) {
    const s = createClash(seed);
    for (let i = 0; i < 4; i++) { addPlayer(s, `b${i}`, `Blue ${i}`, 'blue', true); addPlayer(s, `o${i}`, `Orange ${i}`, 'orange', true); }
    const brain = {};
    let seedRng = seed * 7919;
    const rng = () => ((seedRng = (seedRng * 16807) % 2147483647) / 2147483647);
    const all = [];
    for (let i = 0; i < (sim.MATCH_SECONDS + 1) * 30 && !s.ended; i++) {
      const ev = [];
      const inputs = bots.botInputs(s, brain, ev, rng);
      ev.push(...step(s, 1 / 30, inputs));
      all.push(...ev);
    }
    assert.ok(s.ended, 'match ended');
    const count = type => all.filter(e => e.type === type).length;
    assert.ok(count('answer') > 10, `bots answered questions (${count('answer')})`);
    assert.ok(count('capture') > 2, `reactors changed hands (${count('capture')})`);
    assert.ok(count('tag') > 2, `players got tagged (${count('tag')})`);
    assert.ok(all.some(e => e.type === 'end'));
    assert.ok(s.score.blue > 0 && s.score.orange > 0, `both teams scored ${Math.round(s.score.blue)}-${Math.round(s.score.orange)}`);
  }
});

const protocol = loadSourceModule('lib/clash/protocol.ts', { './sim': sim });

test('snapshots round-trip the world state compactly', () => {
  const s = createClash(5);
  for (let i = 0; i < 3; i++) { addPlayer(s, `b${i}`, `Blue ${i}`, 'blue', true); addPlayer(s, `o${i}`, `Orange ${i}`, 'orange', true); }
  const brain = {};
  let ev = [];
  for (let i = 0; i < 30 * 70; i++) { const e = []; const inp = bots.botInputs(s, brain, e, Math.random); e.push(...step(s, 1 / 30, inp)); ev = e.length ? e : ev; }
  s.players.b0.locks.t3 = s.t + 4;
  const snap = protocol.encodeSnapshot(s, ev);
  const names = new Map(protocol.encodeRoster(s).map(([id, name]) => [id, name]));
  const g = protocol.decodeSnapshot(JSON.parse(JSON.stringify(snap)), names);
  assert.equal(Object.keys(g.players).length, 6);
  for (const p of Object.values(s.players)) {
    const q = g.players[p.id];
    assert.ok(Math.abs(q.x - p.x) <= 0.5 && Math.abs(q.y - p.y) <= 0.5, 'positions');
    assert.equal(q.team, p.team); assert.equal(q.alive, p.alive); assert.equal(q.name, p.name);
    assert.equal(q.answering, p.answering);
  }
  assert.ok(g.players.b0.locks.t3 > g.t, 'locks survive');
  assert.deepEqual(g.reactors.map(r => r.owner), s.reactors.map(r => r.owner));
  assert.equal(g.minions.length, s.minions.length);
  assert.ok(JSON.stringify(snap).length < 4000, `snapshot is small (${JSON.stringify(snap).length} bytes)`);
});

test('student input messages are clamped and sanitised', () => {
  const m = protocol.inputFromMsg({ id: 'x', k: 'y', x: 'far', y: 1e9, a: Number.NaN, f: 1, s: 'yes' });
  assert.deepEqual({ ...m.input }, { mx: 0, my: 0, aim: 0, fire: true, sprint: false });
  assert.ok(Number.isNaN(m.x));
  assert.equal(m.y, 1e5);
});

test('remote positions are accepted only as far as plausible', () => {
  const s = createClash(1);
  const p = addPlayer(s, 'r', 'R', 'blue');
  p.remote = true; p.x = 400; p.y = 330; p.energy = 0;
  sim.applyRemotePosition(s, 'r', 1400, 330, 1 / 30);
  assert.ok(p.x - 400 <= sim.SPEED / 30 * 1.25 + 2.01, `teleport clamped to walking speed (${p.x - 400})`);
  p.energy = 50; const x0 = p.x;
  sim.applyRemotePosition(s, 'r', p.x + 13, 330, 1 / 30);
  assert.ok(p.x - x0 > 12 && p.energy < 50, 'sprint-speed move allowed with energy, and costs energy');
  const wall = sim.WALLS[4];
  p.x = wall.x - sim.PLAYER_R - 2; p.y = wall.y + 10;
  sim.applyRemotePosition(s, 'r', wall.x + 10, wall.y + 10, 1 / 30);
  assert.ok(p.x <= wall.x - sim.PLAYER_R + 0.5, 'cannot move into a wall');
  const before = { x: p.x, y: p.y };
  step(s, 1 / 30, { r: { ...IDLE, mx: 1 } });
  assert.deepEqual({ x: p.x, y: p.y }, before, 'remote players are not moved by inputs');
});

test('match length is configurable', () => {
  const s = createClash(1, 90);
  addPlayer(s, 'a', 'A', 'blue');
  const ev = tick(s, 31);
  assert.ok(ev.some(e => e.type === 'boss-spawn'), 'boss arrives with a minute left of a 90s match');
  tick(s, 60);
  assert.ok(s.ended);
});
