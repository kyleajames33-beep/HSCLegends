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
  p.x = term.x; p.y = term.y; p.energy = 1;
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
  assert.equal(p.x, 400, 'zero energy rejects remote movement');
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

test('late movement uses the report interval and cannot tunnel through cover', () => {
  const s = createClash();
  const p = addPlayer(s, 'r', 'R', 'blue');
  p.x = 400; p.y = 330;
  sim.applyRemotePosition(s, 'r', p.x + sim.SPEED, p.y, 1);
  assert.equal(p.x, 400 + sim.SPEED);
  assert.equal(p.energy, sim.START_ENERGY - sim.WALK_COST, 'a delayed walk costs only walking energy');
  const wall = sim.WALLS[4];
  p.x = wall.x - sim.PLAYER_R - 4; p.y = wall.y + 20;
  sim.applyRemotePosition(s, 'r', wall.x + wall.w + 100, p.y, 1);
  assert.ok(p.x <= wall.x - sim.PLAYER_R);
});

test('acknowledgements preserve later movement and ease even large corrections', () => {
  const { PositionCorrection } = loadSourceModule('lib/clash/prediction.ts', { './sim': sim });
  const correction = new PositionCorrection();
  correction.record(1, 500, 330);
  correction.record(2, 512, 330);
  const local = { x: 520, y: 330 };
  correction.acknowledge(local, { x: 300, y: 330 }, 1);
  assert.equal(local.x, 320, 'keeps the 20px walked since the report');
  assert.equal(correction.display(local, 0).x, 520, 'no visual snap on receipt');
  assert.ok(correction.display(local, 1 / 30).x >= 510, 'bounds the first frame of correction');
  correction.acknowledge(local, { x: 312, y: 330 }, 2);
  correction.acknowledge(local, { x: 312, y: 330 }, 2);
  assert.equal(local.x, 320, 'neither in-flight nor duplicate acknowledgements apply the correction twice');
  for (let i = 0; i < 60; i++) correction.display(local, 1 / 30);
  assert.ok(Math.abs(correction.display(local, 0).x - local.x) < 0.01);
});

function walker(t, x) {
  const g = createClash();
  const player = addPlayer(g, 'r', 'Remote', 'blue');
  Object.assign(player, { x, y: 330 });
  g.t = t;
  return g;
}

test('bursty deliveries play back at host speed and a missing snapshot is bridged briefly', () => {
  const buf = new protocol.SnapshotBuffer();
  assert.equal(buf.sample(0), undefined);
  buf.push(walker(0, 400), 1000);
  buf.push(walker(0.1, 420), 1170);
  buf.push(walker(0.2, 440), 1200);
  const x = now => buf.sample(now).players.r.x;
  assert.equal(x(1100), 400, 'warm-up holds the oldest position');
  for (let now = 1200; now <= 1410; now += 10) {
    const expected = 400 + (now - 1150) * 0.2;
    assert.ok(Math.abs(x(now) - expected) < 1, `at ${now}: expected ${expected}, saw ${x(now)}`);
  }
  assert.equal(x(1420), x(2100), 'a long gap holds the bounded projection');
  assert.equal(buf.latest.g.players.r.x, 440, 'rendering leaves the authoritative position intact');
  buf.push(walker(1.1, 600), 2100);
  assert.equal(x(2101), 600, 'recovery discards the stale trajectory');
});

test('remote rendering respects respawns, terminal locks, walls and projectile identities', () => {
  const a = walker(1, 400), b = walker(1.1, 420);
  b.players.r.respawnAt = 1.05;
  assert.equal(protocol.lerpState(a, b, 0.5).players.r.x, 400);
  assert.equal(protocol.lerpState(a, b, 1.5).players.r.x, 420);
  b.players.r.respawnAt = 0;
  b.players.r.answering = 't1';
  assert.equal(protocol.lerpState(a, b, 1.5).players.r.x, 420);
  const w = sim.WALLS[4];
  Object.assign(b.players.r, { answering: null, x: w.x - sim.PLAYER_R - 2, y: w.y + 20 });
  Object.assign(a.players.r, { x: b.players.r.x - 20, y: b.players.r.y });
  assert.ok(protocol.lerpState(a, b, 1.6).players.r.x <= w.x - sim.PLAYER_R);
  const shot = (id, x) => ({ id, x, y: 330, vx: 560, vy: 0, team: 'blue' });
  a.shots = [shot(1, 500), shot(2, 600)];
  b.shots = [shot(2, 656), shot(3, 640)];
  const wire = g => protocol.decodeSnapshot(protocol.encodeSnapshot(g, []), new Map());
  const view = protocol.lerpState(wire(a), wire(b), 0.5);
  assert.deepEqual(Array.from(view.shots, s => [s.id, s.x]), [[1, 500], [2, 628]]);
});

test('walking and sprinting charge for distance travelled and stop at exact exhaustion', () => {
  for (const remote of [false, true]) for (const sprint of [false, true]) {
    const g = createClash();
    const p = addPlayer(g, 'p', 'Player', 'blue');
    const speed = sprint ? sim.SPRINT_SPEED : sim.SPEED;
    const cost = sprint ? sim.SPRINT_COST : sim.WALK_COST;
    Object.assign(p, { remote, x: 400, y: 330, energy: cost / 4 });
    tick(g, 1);
    assert.equal(p.energy, cost / 4, 'no idle drain');
    const input = { ...IDLE, mx: 1, sprint };
    for (let i = 0; i < 30; i++) {
      if (remote) sim.applyRemotePosition(g, p.id, p.x + speed / 30, p.y, 1 / 30, sprint);
      step(g, 1 / 30, { p: input });
    }
    assert.ok(Math.abs(p.x - 400 - speed / 4) < 1e-6);
    assert.equal(p.energy, 0);
    assert.equal(p.answering, sim.EMERGENCY);
    assert.equal(protocol.decodeSnapshot(protocol.encodeSnapshot(g, []), new Map()).players.p.answering, sim.EMERGENCY);
  }
});

test('emergency refuels in place without a terminal or streak bonus and wrong answers leave you frozen', () => {
  const g = createClash();
  const p = addPlayer(g, 'p', 'Player', 'blue');
  assert.equal(terminalNear(g, p), null);
  assert.equal(answerResult(g, p.id, true), 0, 'a receipt alone at positive energy grants nothing');
  p.energy = sim.SHOT_COST;
  step(g, 1 / 30, { p: { ...IDLE, fire: true } });
  assert.equal(p.answering, sim.EMERGENCY, 'last shot triggers emergency');
  sim.cancelAnswer(g, p.id);
  assert.equal(p.answering, sim.EMERGENCY);
  answerResult(g, p.id, false);
  const x = p.x;
  tick(g, 1, { p: { ...IDLE, mx: 1 } });
  assert.equal(p.x, x);
  assert.equal(p.energy, 0);
  assert.equal(Object.keys(p.locks).length, 0);
  p.streak = 3;
  assert.equal(answerResult(g, p.id, true), sim.EMERGENCY_REWARD);
  assert.equal(answerResult(g, p.id, true), 0, 'cannot grant the same refuel again');
  assert.equal(p.stats.answered, 2);
  assert.equal(p.streak, 3);
  assert.equal(p.x, x);
  tick(g, 0.2, { p: { ...IDLE, mx: 1 } });
  assert.ok(p.x > x);
  p.energy = 0; p.alive = false;
  assert.equal(answerResult(g, p.id, true), 0);
  step(g, 1 / 30, {});
  assert.equal(p.answering, sim.EMERGENCY, 'empty respawn opens a fresh question');
});

test('an idle heartbeat at the wire-rounded position cannot spend a fresh refuel', () => {
  const g = createClash(), p = addPlayer(g, 'r', 'Remote', 'blue');
  Object.assign(p, { remote: true, x: 400.4, y: 330.5, energy: 0 });
  answerResult(g, p.id, true);
  sim.applyRemotePosition(g, p.id, 400, 331, 0.4);
  assert.deepEqual([p.x, p.y, p.energy], [400.4, 330.5, sim.EMERGENCY_REWARD]);
});
