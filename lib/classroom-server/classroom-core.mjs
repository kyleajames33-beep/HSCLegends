import { createHash, timingSafeEqual } from 'node:crypto';

// Pure server-side policy core. Not connected to Supabase or exported as a route.
// repo.transaction(callback) MUST provide serializable, atomic, rollback-on-error
// execution for every affected session/player/answer/claim. The test adapter is
// synthetic. No production adapter, credential issuer, or auth verifier exists.
export class ClassroomError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = (code) => { throw new ClassroomError(code); };
export function hashSessionSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 512) fail('forbidden');
  return createHash('sha256').update(secret).digest('hex');
}
function equalHash(a, b) {
  if (typeof a !== 'string' || !/^[0-9a-f]{64}$/.test(a)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validQuestion(q) {
  return q && typeof q.stem === 'string' && Array.isArray(q.options) && q.options.length > 1
    && q.options.every(o => typeof o === 'string') && Number.isInteger(q.correctIndex)
    && q.correctIndex >= 0 && q.correctIndex < q.options.length
    && typeof q.revision === 'string' && q.revision.length > 0;
}
// Session-creation adapter must persist this once BEFORE exposing any question.
// No lazy writes from snapshot. Production storage must enforce immutability;
// the fingerprint detects inconsistency, it is not authorization or a signature.
export function sealSessionQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length || !questions.every(validQuestion)) fail('unverified-question');
  const frozen = structuredClone(questions);
  return { version: 1, questions: frozen, fingerprint: fingerprint(frozen) };
}
function sealedQuestions(session) {
  const set = session.questionSet;
  if (!set || set.version !== 1 || !Array.isArray(set.questions)
      || !set.questions.every(validQuestion) || set.fingerprint !== fingerprint(set.questions)) fail('unverified-question');
  return set.questions;
}
function receiptFingerprint(a) {
  return fingerprint({ questionIndex: a.questionIndex, questionSnapshot: a.questionSnapshot,
    correctIndex: a.correctIndex, contentRevision: a.contentRevision });
}
function hasFrozenProvenance(a) {
  const q = a.questionSnapshot;
  return a.provenanceVersion === 1 && q && typeof q.stem === 'string'
    && Array.isArray(q.options) && q.options.length > 1 && q.options.every(o => typeof o === 'string')
    && typeof a.contentRevision === 'string' && a.contentRevision.length > 0
    && q.contentRevision === a.contentRevision && Number.isInteger(a.correctIndex)
    && a.correctIndex >= 0 && a.correctIndex < q.options.length
    && a.snapshotFingerprint === receiptFingerprint(a);
}
function receiptView(a) {
  const frozen = hasFrozenProvenance(a);
  return {
    questionIndex: a.questionIndex, acceptedChoice: a.choice,
    isCorrect: a.isCorrect, points: a.points, answeredAt: a.answeredAt,
    correctIndex: frozen ? a.correctIndex : null, contentRevision: frozen ? a.contentRevision : null,
    keyProvenance: frozen ? 'frozen' : 'legacy-unavailable',
  };
}
export function createClassroomCore({ repo, now }) {
  if (typeof repo?.transaction !== 'function' || typeof now !== 'function') throw new TypeError('Missing trusted adapters');
  function owned(tx, proof) {
    if (!proof || typeof proof.sessionId !== 'string' || typeof proof.playerId !== 'string') fail('forbidden');
    const digest = hashSessionSecret(proof.secret);
    const session = tx.sessions.get(proof.sessionId);
    const player = tx.players.get(proof.playerId);
    const grant = tx.guestSessions.get(proof.playerId);
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || !session || !player || !grant
        || player.sessionId !== session.id || grant.sessionId !== session.id
        || grant.playerId !== player.id || !equalHash(grant.secretHash, digest)
        || grant.revoked || !Number.isSafeInteger(grant.expiresAt)
        || !Number.isSafeInteger(session.expiresAt)
        || timestamp >= grant.expiresAt || timestamp >= session.expiresAt) fail('forbidden');
    return { session, player, timestamp };
  }
  const key = (player, index) => `${player.id}:${index}`;
  function validateIndex(questions, index) {
    if (!Number.isInteger(index) || index < 0 || index >= questions.length) fail('invalid-question');
  }
  return Object.freeze({
    snapshot(proof, expectedIndex) {
      return repo.transaction((tx) => {
        const { session, player } = owned(tx, proof);
        if (!Number.isInteger(expectedIndex) || expectedIndex !== session.currentIndex) fail('stale-question');
        const answer = tx.answers.get(key(player, session.currentIndex));
        const question = !answer && session.currentIndex >= 0 ? sealedQuestions(session)[session.currentIndex] : null;
        if (!answer && session.currentIndex >= 0 && !question) fail('invalid-question');
        const historicalAvailable = answer ? hasFrozenProvenance(answer) : false;
        return {
          schemaVersion: 1, sessionId: session.id, playerId: player.id,
          status: session.status, index: session.currentIndex,
          // An accepted answer is displayed against its frozen question, never a
          // subsequently edited bank entry. Legacy receipts cannot supply this.
          question: answer ? (historicalAvailable ? structuredClone(answer.questionSnapshot) : null)
            : question ? { stem: question.stem, options: [...question.options], contentRevision: question.revision } : null,
          contentStatus: answer ? (historicalAvailable ? 'frozen' : 'historical-content-unavailable') : 'current-session',
          ownReceipt: answer ? receiptView(answer) : null,
        };
      });
    },
    submit(proof, { index, choice }) {
      return repo.transaction((tx) => {
        const { session, player, timestamp } = owned(tx, proof);
        if (!Number.isInteger(index) || index < 0) fail('invalid-question');
        // Ownership first; a retry only reads its own immutable committed receipt.
        // Replay is safe even if the host has advanced/completed since acceptance.
        const previous = tx.answers.get(key(player, index));
        if (previous) return receiptView(previous);
        const questions = sealedQuestions(session);
        validateIndex(questions, index);
        const q = questions[index];
        if (session.status !== 'active' || session.currentIndex !== index) fail('stale-question');
        if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) fail('invalid-choice');
        if (!Number.isSafeInteger(session.startedAt) || !Number.isSafeInteger(session.durationMs)
            || session.durationMs <= 0 || timestamp < session.startedAt
            || timestamp >= session.startedAt + session.durationMs) fail('answer-window-closed');
        if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length
            || typeof q.revision !== 'string' || !q.revision) fail('unverified-question');
        const isCorrect = choice === q.correctIndex;
        const remaining = session.durationMs - (timestamp - session.startedAt);
        const points = isCorrect ? (100 + Math.max(0, Math.round(remaining / session.durationMs * 50)))
          * (index === session.doubleIndex ? 2 : 1) : 0;
        const answer = { sessionId: session.id, playerId: player.id, questionIndex: index, choice,
          isCorrect, points, answeredAt: timestamp, correctIndex: q.correctIndex, contentRevision: q.revision,
          questionSnapshot: { stem: q.stem, options: [...q.options], contentRevision: q.revision } };
        answer.provenanceVersion = 1;
        answer.snapshotFingerprint = receiptFingerprint(answer);
        tx.answers.set(key(player, index), answer);
        player.score += points;
        return receiptView(answer);
      });
    },
    ownStanding(proof) {
      return repo.transaction((tx) => {
        const { session, player } = owned(tx, proof);
        if (session.status !== 'complete') fail('not-complete');
        const higher = [...tx.players.values()].filter(p => p.sessionId === session.id && p.score > player.score).length;
        return { score: player.score, rank: higher + 1 };
      });
    },
    // principal MUST originate from independently verified server authentication,
    // never from a JSON body or caller-selected header. No verifier is implemented.
    hostRoster(principal, sessionId) {
      return repo.transaction((tx) => {
        const session = tx.sessions.get(sessionId);
        if (!principal?.userId || !session?.hostId || session.hostId !== principal.userId) fail('forbidden');
        return [...tx.players.values()].filter(p => p.sessionId === sessionId)
          .map(p => ({ alias: p.alias, score: p.score })).sort((a,b) => b.score-a.score);
      });
    },
    claim(proof, principal) {
      return repo.transaction((tx) => {
        const { session, player } = owned(tx, proof);
        if (!principal?.userId || principal.isAnonymous !== false) fail('forbidden');
        if (session.status !== 'complete') fail('not-complete');
        // Signed-in-owned participants cannot transfer to another account.
        if (player.ownerId && player.ownerId !== principal.userId) fail('forbidden');
        const previous = tx.claims.get(player.id);
        if (previous) {
          if (previous.userId !== principal.userId) fail('forbidden');
          return { ...previous };
        }
        const result = { playerId: player.id, userId: principal.userId, awarded: Math.max(0, player.score) };
        tx.claims.set(player.id, result);
        tx.xp.set(principal.userId, (tx.xp.get(principal.userId) ?? 0) + result.awarded);
        return { ...result };
      });
    },
  });
}
