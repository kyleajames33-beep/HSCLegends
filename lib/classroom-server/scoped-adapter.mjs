import { ClassroomError, createClassroomCore, hashSessionSecret, sealSessionQuestions } from './classroom-core.mjs';

// Local review candidate only. This module neither connects to a database nor
// grants access. Its caller must supply the trusted SERIALIZABLE transaction
// runner below (or an equivalent connection-pinned, rollback-on-error runner).
const fail = code => { throw new ClassroomError(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const ms = value => value == null ? null : new Date(value).getTime();
const answerKey = (playerId, index) => `${playerId}:${index}`;
const acceptedFields = ['playerId', 'sessionId', 'questionIndex', 'choice', 'isCorrect', 'points', 'answeredAt'];
const clockSql = 'select floor(extract(epoch from clock_timestamp()) * 1000)::bigint as now_ms';

function playerView(p) {
  return { id: p.id, sessionId: p.session_id, ownerId: p.user_id, alias: p.alias, score: p.score };
}
function sessionView(s) {
  return { id: s.id, hostId: s.host_id, status: s.status, currentIndex: s.current_index,
    startedAt: ms(s.question_started_at), durationMs: s.per_question_seconds * 1000,
    expiresAt: ms(s.expires_at), doubleIndex: s.double_index };
}
async function databaseNow(sql) {
  const now = Number((await sql.query(clockSql)).rows[0]?.now_ms);
  if (!Number.isSafeInteger(now)) fail('database-clock-unavailable');
  return now;
}

// Read only the one requested answer. Payload validation is delayed until the
// core asks for that answer, after its ownership and expiry checks. Thus even a
// corrupt own sidecar cannot turn an unauthorised request into an integrity oracle.
class ScopedAnswers extends Map {
  constructor(row) {
    super();
    if (!row) return;
    const base = { sessionId: row.session_id, playerId: row.player_id,
      questionIndex: row.question_index, choice: row.choice, isCorrect: row.is_correct,
      points: row.points, answeredAt: ms(row.answered_at) };
    super.set(answerKey(base.playerId, base.questionIndex), base);
    this.payload = row.receipt_payload;
    this.hasPayload = row.has_receipt;
  }
  get(key) {
    const base = super.get(key);
    if (!base || !this.hasPayload) return base;
    const payload = this.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || acceptedFields.some(field => payload[field] !== base[field])) {
      fail('receipt-integrity-unavailable');
    }
    return payload;
  }
}

export function createScopedClassroomService({ runTransaction }) {
  if (typeof runTransaction !== 'function') throw new TypeError('Missing trusted transaction runner');

  // The scope is constructed inside this service from the operation arguments,
  // never independently accepted from a route. Copy inputs before the first await
  // so mutation by another caller cannot switch the principal or selected scope.
  async function perform(operation, input, argument) {
    const isHost = operation === 'hostRoster';
    const principal = isHost ? { userId: input?.userId } : null;
    const proof = isHost ? null : { sessionId: input?.sessionId, playerId: input?.playerId, secret: input?.secret };
    // HTTP MUST supply this server-owned guard from join/resolve ownerId, even
    // when null. Cookie resolution occurs in a separate transaction; rechecking
    // the locked player closes a guest-to-owned transition race before evidence
    // reads. Omission is retained only for existing trusted direct-core callers.
    const hasOwnerGuard = !isHost && input != null && Object.hasOwn(input, 'expectedOwnerId');
    if (hasOwnerGuard) {
      const expectedOwnerId = input.expectedOwnerId;
      if (expectedOwnerId !== null && !uuid(expectedOwnerId)) fail('forbidden');
      proof.expectedOwnerId = expectedOwnerId === null ? null : expectedOwnerId.toLowerCase();
    }
    const sessionId = isHost ? argument : proof.sessionId;
    if (!uuid(sessionId) || (!isHost && !uuid(proof.playerId))) fail('forbidden');
    if (isHost && !uuid(principal.userId)) fail('forbidden');
    const digest = isHost ? null : hashSessionSecret(proof.secret);
    const request = operation === 'submit' ? { index: argument?.index, choice: argument?.choice } : argument;
    if (operation === 'submit' && (!Number.isInteger(request.index) || request.index < 0 || request.index > 32767)) fail('invalid-question');

    // One independent repository per operation: no global cache, no global Maps,
    // no user-selected table names, and no secret included in a SQL parameter.
    return runTransaction(async sql => {
      // All writers (future host advance/revoke/join included) must respect this
      // order: session -> guest grant -> players (UUID ascending) -> answer.
      // Room SHARE locks allow different participants to submit concurrently.
      const sessionRow = (await sql.query(`select id, host_id, status, current_index,
        question_started_at, per_question_seconds, expires_at, double_index
        from public.game_sessions where id = $1 for share`, [sessionId])).rows[0];
      const session = sessionRow && sessionView(sessionRow);
      const sessions = new Map(session ? [[session.id, session]] : []);
      const players = new Map(), guestSessions = new Map();
      let timestamp;
      if (isHost) {
        // Do not read room player rows until the independently trusted principal
        // matches. The unchanged core repeats this policy check before returning.
        if (!session || session.hostId !== principal.userId) fail('forbidden');
        const rows = (await sql.query(`select id, session_id, alias, score
          from public.game_players where session_id = $1 order by id for share`, [sessionId])).rows;
        for (const p of rows) players.set(p.id, playerView(p));
        timestamp = await databaseNow(sql);
      } else {
        const grantRow = (await sql.query(`select player_id, session_id, secret_hash, expires_at, revoked
          from classroom_candidate_private.guest_sessions
          where session_id = $1 and player_id = $2 and secret_hash = $3
          for share`, [sessionId, proof.playerId, digest])).rows[0];
        // A minimizing SQL/read gate, followed by unchanged core authentication.
        // Fail closed before loading anyone's score, question set or receipt.
        timestamp = await databaseNow(sql);
        if (!session || !grantRow || grantRow.revoked
            || !Number.isSafeInteger(ms(grantRow.expires_at)) || !Number.isSafeInteger(session.expiresAt)
            || ms(grantRow.expires_at) <= timestamp || session.expiresAt <= timestamp) fail('forbidden');
        guestSessions.set(proof.playerId, { playerId: grantRow.player_id, sessionId: grantRow.session_id,
          secretHash: grantRow.secret_hash, expiresAt: ms(grantRow.expires_at), revoked: grantRow.revoked });
        if (hasOwnerGuard) {
          const lock = operation === 'submit' ? 'for no key update' : 'for share';
          const guardedPlayer = (await sql.query(`select id, session_id, user_id, score from public.game_players
            where session_id = $1 and id = $2 ${lock}`, [sessionId, proof.playerId])).rows[0];
          if (!guardedPlayer || guardedPlayer.user_id !== proof.expectedOwnerId) fail('forbidden');
          players.set(guardedPlayer.id, playerView(guardedPlayer));
        }
        if (operation === 'ownStanding' || (operation === 'ownSnapshot' && session.status === 'complete')) {
          // The core computes rank using values(); load only room identities and
          // scores, never another player's alias, owner or guest credential.
          // Guarded requests already locked their own row. Read peer scores in
          // this same SERIALIZABLE snapshot without acquiring peer row locks in
          // a different UUID order. Unchanged direct calls retain the old locks.
          const peerLock = hasOwnerGuard ? '' : 'for share';
          const rows = (await sql.query(`select id, session_id, score from public.game_players
            where session_id = $1 order by id ${peerLock}`, [sessionId])).rows;
          for (const p of rows) players.set(p.id, playerView(p));
        } else if (!hasOwnerGuard) {
          const lock = operation === 'submit' ? 'for no key update' : 'for share';
          const p = (await sql.query(`select id, session_id, user_id, score from public.game_players
            where session_id = $1 and id = $2 ${lock}`, [sessionId, proof.playerId])).rows[0];
          if (p) players.set(p.id, playerView(p));
        }
      }
      const originalScore = players.get(proof?.playerId)?.score;
      let answers = new ScopedAnswers();
      if (operation === 'snapshot' || operation === 'ownSnapshot' || operation === 'submit') {
        const index = operation === 'submit' ? request.index : session.currentIndex;
        if (index >= 0 && !(operation === 'ownSnapshot' && session.status === 'complete')) {
          // Only the accepted base row is locked. Receipt/question-set sidecars
          // are immutable and are read in the same SERIALIZABLE snapshot.
          const row = (await sql.query(`select a.session_id, a.player_id, a.question_index,
            a.choice, a.is_correct, a.points, a.answered_at, r.payload as receipt_payload,
            (r.player_id is not null) as has_receipt
            from public.game_answers a
            left join classroom_candidate_private.receipts r
              on r.player_id = a.player_id and r.question_index = a.question_index
            where a.session_id = $1 and a.player_id = $2 and a.question_index = $3
            for share of a`, [sessionId, proof.playerId, index])).rows[0];
          answers = new ScopedAnswers(row);
        }
        if (answers.size === 0 || operation === 'ownSnapshot') {
          const set = (await sql.query(`select payload from classroom_candidate_private.question_sets
            where session_id = $1`, [sessionId])).rows[0];
          if (set && session) session.questionSet = set.payload;
        }
      }
      // Sample the authoritative database wall clock after ALL potentially
      // blocking row locks, not transaction_timestamp()/request-start time.
      timestamp = await databaseNow(sql);
      const oldAnswerKeys = new Set(answers.keys());
      const tx = { sessions, players, guestSessions, answers, claims: new Map(), xp: new Map() };
      const core = createClassroomCore({ repo: { transaction: fn => fn(tx) }, now: () => timestamp });
      let result;
      if (isHost) result = await core.hostRoster(principal, sessionId);
      else if (operation === 'ownSnapshot') {
        if (session.status === 'complete') {
          // Completion is a terminal summary, not a request for the next bank
          // question. This composition verifies possession through the unchanged
          // core and works with current_index == total or legacy missing sets.
          await core.ownStanding(proof);
          result = { schemaVersion: 1, sessionId: session.id, playerId: proof.playerId,
            status: session.status, index: session.currentIndex, question: null,
            contentStatus: 'current-session', ownReceipt: null };
        } else result = await core.snapshot(proof, session.currentIndex);
        // Total is display metadata only. Missing/corrupt sealed-set metadata must
        // not destroy recovery of an independently valid immutable receipt.
        let total = null;
        try {
          const sealed = sealSessionQuestions(session.questionSet?.questions);
          if (session.questionSet?.version === 1 && sealed.fingerprint === session.questionSet.fingerprint) total = sealed.questions.length;
        } catch { /* Historical receipt recovery remains available. */ }
        result = { ...result, total, startedAt: session.startedAt, durationMs: session.durationMs,
          isDouble: session.currentIndex === session.doubleIndex };
      } else result = await core[operation](proof, request);
      if (operation === 'submit') {
        const newAnswers = [...answers].filter(([key]) => !oldAnswerKeys.has(key));
        if (newAnswers.length > 1) fail('adapter-scope-violation');
        for (const [, a] of newAnswers) {
          if (a.sessionId !== sessionId || a.playerId !== proof.playerId || a.questionIndex !== request.index) fail('adapter-scope-violation');
          await sql.query(`insert into public.game_answers
            (session_id, player_id, question_index, choice, is_correct, points, answered_at)
            values ($1, $2, $3, $4, $5, $6, $7)`,
          [sessionId, proof.playerId, a.questionIndex, a.choice, a.isCorrect, a.points, new Date(a.answeredAt).toISOString()]);
          await sql.query(`insert into classroom_candidate_private.receipts (player_id, question_index, payload)
            values ($1, $2, $3::json)`, [proof.playerId, a.questionIndex, JSON.stringify(a)]);
        }
        const nextScore = players.get(proof.playerId)?.score;
        if (nextScore !== originalScore) {
          const changed = await sql.query(`update public.game_players set score = $1
            where session_id = $2 and id = $3 and score = $4 returning id`,
          [nextScore, sessionId, proof.playerId, originalScore]);
          if (changed.rows.length !== 1) fail('score-write-conflict');
        }
      }
      return structuredClone(result);
    });
  }
  return Object.freeze({
    ownSnapshot: proof => perform('ownSnapshot', proof),
    snapshot: (proof, expectedIndex) => perform('snapshot', proof, expectedIndex),
    submit: (proof, answer) => perform('submit', proof, answer),
    ownStanding: proof => perform('ownStanding', proof),
    hostRoster: (principal, sessionId) => perform('hostRoster', principal, sessionId),
    async claim() { fail('claim-integration-unavailable'); },
  });
}
