// ISOLATED SYNTHETIC MODEL. This is not a Supabase migration or HTTP endpoint.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest();
const forbidden = () => { throw new Error('FORBIDDEN'); };
const isId = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const validSecret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export function openModel(path = ':memory:', clock = Date.now) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('lobby','active','complete')), active_index INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), credential_hash BLOB NOT NULL, score INTEGER NOT NULL DEFAULT 0 CHECK(score >= 0));
    CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), question_index INTEGER NOT NULL, stem TEXT NOT NULL, options_json TEXT NOT NULL, correct_index INTEGER NOT NULL, opens_ms INTEGER NOT NULL, closes_ms INTEGER NOT NULL, UNIQUE(room_id, question_index));
    CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), player_id TEXT NOT NULL REFERENCES players(id), question_id TEXT NOT NULL REFERENCES questions(id), accepted_choice INTEGER NOT NULL, is_correct INTEGER NOT NULL CHECK(is_correct IN (0,1)), correct_index INTEGER NOT NULL, points INTEGER NOT NULL CHECK(points >= 0), accepted_ms INTEGER NOT NULL, UNIQUE(room_id, player_id, question_id));`);
  const authenticate = (roomId, playerId, secret) => {
    if (!isId(roomId) || !isId(playerId) || !validSecret(secret)) forbidden();
    const player = db.prepare('SELECT id, room_id, credential_hash, score FROM players WHERE id = ? AND room_id = ?').get(playerId,roomId);
    const actual = hash(secret);
    // Do the same comparison for absent records; error and response stay uniform.
    const expected = player ? Buffer.from(player.credential_hash) : Buffer.alloc(32);
    const matched = timingSafeEqual(actual,expected);
    if (!player || !matched) forbidden();
    return player;
  };
  const findQuestion = room => db.prepare('SELECT * FROM questions WHERE room_id = ? AND question_index = ?').get(room.id, room.active_index);
  const roomFor = roomId => db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  const receiptFor = (roomId,playerId,questionId) => db.prepare('SELECT id, question_id, accepted_choice, is_correct, correct_index, points, accepted_ms FROM receipts WHERE room_id = ? AND player_id = ? AND question_id = ?').get(roomId,playerId,questionId);
  const publicReceipt = row => row ? { receipt_id:row.id, question_instance_id:row.question_id, accepted_choice:row.accepted_choice, is_correct:!!row.is_correct, correct_index:row.correct_index, awarded_points:row.points, accepted_ms:row.accepted_ms } : null;
  const readSnapshot = (roomId,playerId,secret) => {
    db.exec('BEGIN');
    try {
      const player=authenticate(roomId,playerId,secret), room=roomFor(roomId), q=findQuestion(room);
      const snapshot = { schema_version:1, session_id:room.id, session_version:room.version, state:room.status, score:player.score,
        question:q ? { instance_id:q.id, index:q.question_index, stem:q.stem, options:JSON.parse(q.options_json), opens_ms:q.opens_ms, closes_ms:q.closes_ms } : null,
        own_receipt:q ? publicReceipt(receiptFor(roomId,playerId,q.id)) : null };
      db.exec('COMMIT'); return snapshot;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const submit = (roomId,playerId,secret,questionId,choice) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      authenticate(roomId,playerId,secret);
      // An already-committed receipt is immutable even when the retry differs.
      const existing=receiptFor(roomId,playerId,questionId);
      if (existing) { db.exec('COMMIT'); return publicReceipt(existing); }
      const room=roomFor(roomId), q=findQuestion(room), now=clock();
      if (!q || room.status!=='active' || q.id!==questionId) throw new Error('STALE_QUESTION');
      if (!Number.isFinite(now) || now<q.opens_ms || now>=q.closes_ms) throw new Error('OUTSIDE_WINDOW');
      const options=JSON.parse(q.options_json);
      if (!Number.isInteger(choice) || choice<0 || choice>=options.length) throw new Error('INVALID_CHOICE');
      const correct=choice===q.correct_index, points=correct ? 100 : 0, receiptId=randomUUID();
      db.prepare('INSERT INTO receipts(id,room_id,player_id,question_id,accepted_choice,is_correct,correct_index,points,accepted_ms) VALUES(?,?,?,?,?,?,?,?,?)').run(receiptId,roomId,playerId,questionId,choice,Number(correct),q.correct_index,points,now);
      db.prepare('UPDATE players SET score=score+? WHERE id=? AND room_id=?').run(points,playerId,roomId);
      db.prepare('UPDATE rooms SET version=version+1 WHERE id=?').run(roomId);
      const receipt=publicReceipt(receiptFor(roomId,playerId,questionId));
      db.exec('COMMIT'); return receipt;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  // Fixture setup is deliberately privileged and outside the callable API.
  const createFixture = (options = {}) => {
    const roomId=randomUUID(), playerId=randomUUID(), questionId=randomUUID(), secret=randomBytes(32).toString('base64url');
    const opens=options.opens ?? 1000, closes=options.closes ?? 10000;
    db.prepare('INSERT INTO rooms(id,status,active_index) VALUES(?,?,?)').run(roomId,'active',0);
    db.prepare('INSERT INTO players(id,room_id,credential_hash) VALUES(?,?,?)').run(playerId,roomId,hash(secret));
    db.prepare('INSERT INTO questions(id,room_id,question_index,stem,options_json,correct_index,opens_ms,closes_ms) VALUES(?,?,?,?,?,?,?,?)').run(questionId,roomId,0,'Which colour is blue?',JSON.stringify(['Blue','Red']),0,opens,closes);
    return {roomId,playerId,questionId,secret};
  };
  const addFixturePlayer = roomId => {
    const playerId=randomUUID(), secret=randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO players(id,room_id,credential_hash) VALUES(?,?,?)').run(playerId,roomId,hash(secret));
    return {playerId,secret};
  };
  return { readSnapshot, submit, createFixture, addFixturePlayer, close:()=>db.close() };
}
