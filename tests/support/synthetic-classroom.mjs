import { classroomFixture } from '../fixtures/classroom.mjs';

// Proposed minimal behavioral model ONLY: not deployed SQL, a migration,
// a PostgREST emulator, or evidence of database transaction/concurrency safety.
export class SyntheticClassroom {
  constructor(fixture = classroomFixture) {
    this.fixture = structuredClone(fixture);
    this.now = Date.parse(fixture.startsAt);
    this.status = 'lobby'; this.index = -1; this.startedAt = null;
    this.players = new Map(); this.receipts = new Map(); this.claims = new Map();
  }
  requireHost(actor) {
    if (actor !== this.fixture.hostId) throw new Error('NOT_HOST');
  }
  requirePlayer(actor, playerId) {
    const player = this.players.get(playerId);
    if (!player || player.actor !== actor) throw new Error('NOT_PLAYER');
    return player;
  }
  join(actor, alias) {
    if (!actor || !alias.trim()) throw new Error('INVALID_PLAYER');
    if (this.status === 'complete') throw new Error('COMPLETE');
    const existing = [...this.players.values()].find((p) => p.actor === actor);
    if (existing) return structuredClone(existing);
    const player = { id: `synthetic-player-${this.players.size + 1}`, actor, alias, score: 0, team: this.players.size % 2 === 0 ? 'red' : 'blue' };
    this.players.set(player.id, player);
    return structuredClone(player);
  }
  start(actor) {
    this.requireHost(actor);
    if (this.status !== 'lobby') return;
    if (!this.players.size) throw new Error('NO_PLAYERS');
    this.status = 'active'; this.index = 0; this.startedAt = this.now;
  }
  advance(actor, expectedIndex) {
    this.requireHost(actor);
    if (this.status !== 'active' || expectedIndex !== this.index) return false;
    if (this.index + 1 >= this.fixture.questions.length) this.status = 'complete';
    else { this.index++; this.startedAt = this.now; }
    return true;
  }
  question(actor, playerId) {
    this.requirePlayer(actor, playerId);
    const q = this.fixture.questions[this.index];
    return { index: this.index, status: this.status, stem: q?.stem ?? null, options: structuredClone(q?.options ?? []), receipt: structuredClone(this.receipts.get(`${playerId}:${this.index}`) ?? null) };
  }
  submit(actor, playerId, index, choice) {
    const player = this.requirePlayer(actor, playerId);
    const key = `${playerId}:${index}`;
    if (this.receipts.has(key)) return structuredClone(this.receipts.get(key));
    if (this.status !== 'active' || index !== this.index) throw new Error('STALE_QUESTION');
    if (this.now >= this.startedAt + this.fixture.secondsPerQuestion * 1000) throw new Error('TOO_LATE');
    const q = this.fixture.questions[index];
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new Error('INVALID_CHOICE');
    const receipt = { index, choice, isCorrect: choice === q.correctIndex, points: choice === q.correctIndex ? 100 : 0, correctIndex: q.correctIndex, explanation: q.explanation };
    this.receipts.set(key, receipt); player.score += receipt.points;
    return structuredClone(receipt);
  }
  resumePlayer(actor, playerId) {
    return { player: structuredClone(this.requirePlayer(actor, playerId)), question: this.question(actor, playerId) };
  }
  resumeHost(actor) {
    this.requireHost(actor);
    return { code: this.fixture.code, roomId: this.fixture.roomId, status: this.status, index: this.index };
  }
  claim(actor, playerId) {
    const player = this.requirePlayer(actor, playerId);
    if (this.status !== 'complete') throw new Error('NOT_COMPLETE');
    if (!this.claims.has(playerId)) this.claims.set(playerId, { awarded: player.score });
    return structuredClone(this.claims.get(playerId));
  }
}
