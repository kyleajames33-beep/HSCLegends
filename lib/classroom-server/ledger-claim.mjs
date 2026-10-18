import { ClassroomError, createClassroomCore, hashSessionSecret } from './classroom-core.mjs';

// Unconnected local candidate. Caller supplies a SERIALIZABLE, connection-pinned
// transaction runner (e.g. ../scoped/serializable-runner.mjs). No legacy claim RPC,
// credentials, production connection, authentication verifier or grants exist here.
const fail = code => { throw new ClassroomError(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const ms = value => value == null ? null : new Date(value).getTime();
const subjects = new Set(['biology', 'chemistry', 'physics', 'maths', 'science', 'maths-standard', 'maths-advanced', 'maths-ext1']);
const maxBigint = 9223372036854775807n;
const clockSql = 'select floor(extract(epoch from clock_timestamp()) * 1000)::bigint as now_ms';
async function databaseNow(sql) {
  const now = Number((await sql.query(clockSql)).rows[0]?.now_ms);
  if (!Number.isSafeInteger(now)) fail('database-clock-unavailable');
  return now;
}
function safeTotal(value) {
  // SELECT casts bigint to text, so a client parser cannot silently round it.
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) fail('xp-total-unavailable');
  const amount = BigInt(value);
  if (amount > maxBigint) fail('xp-total-unavailable');
  return amount;
}
function exactEvent(event, expected) {
  return event && event.user_id === expected.userId && event.reason_key === expected.reasonKey
    && event.amount === expected.awarded && event.kind === 'xp' && event.subject === expected.subject;
}
function exactClaim(claim, event, expected) {
  return claim && claim.player_id === expected.playerId && claim.session_id === expected.sessionId
    && claim.user_id === expected.userId && claim.event_id === event.id && claim.awarded === expected.awarded
    && claim.reason_key === expected.reasonKey && claim.kind === 'xp' && claim.subject === expected.subject
    && ['awarded', 'reconciled'].includes(claim.disposition);
}

export function createLedgerClaimService({ runTransaction }) {
  if (typeof runTransaction !== 'function') throw new TypeError('Missing trusted transaction runner');
  return Object.freeze({
    async claim(input, trustedPrincipal) {
      // Only the request boundary may construct a trusted principal; body fields
      // or matching aliases/legacy event rows never establish account identity.
      const proof = { sessionId: input?.sessionId, playerId: input?.playerId, secret: input?.secret };
      const principal = { userId: trustedPrincipal?.userId, isAnonymous: trustedPrincipal?.isAnonymous };
      if (!uuid(proof.sessionId) || !uuid(proof.playerId) || !uuid(principal.userId)
          || principal.isAnonymous !== false) fail('forbidden');
      const digest = hashSessionSecret(proof.secret);
      return runTransaction(async sql => {
        // Compatible extension of scoped lock order: session -> grant -> player
        // -> immutable claim -> same-reason events (user/id order) -> destination
        // profile -> destination stats. No other player lock is acquired later.
        const room = (await sql.query(`select id, status, expires_at, subject::text as subject
          from public.game_sessions where id = $1 for share`, [proof.sessionId])).rows[0];
        const grant = (await sql.query(`select player_id, session_id, secret_hash, expires_at, revoked
          from classroom_candidate_private.guest_sessions
          where session_id = $1 and player_id = $2 and secret_hash = $3 for share`,
        [proof.sessionId, proof.playerId, digest])).rows[0];
        let timestamp = await databaseNow(sql);
        if (!room || !grant || grant.revoked || !Number.isSafeInteger(ms(grant.expires_at))
            || !Number.isSafeInteger(ms(room.expires_at))
            || timestamp >= ms(grant.expires_at) || timestamp >= ms(room.expires_at)) fail('forbidden');
        const row = (await sql.query(`select id, session_id, user_id, score from public.game_players
          where session_id = $1 and id = $2 for no key update`, [proof.sessionId, proof.playerId])).rows[0];
        if (!row || !Number.isInteger(row.score) || row.score < -2147483648 || row.score > 2147483647) fail('forbidden');
        const session = { id: room.id, status: room.status, expiresAt: ms(room.expires_at) };
        const player = { id: row.id, sessionId: row.session_id, ownerId: row.user_id, score: row.score };
        const guestSession = { playerId: grant.player_id, sessionId: grant.session_id,
          secretHash: grant.secret_hash, expiresAt: ms(grant.expires_at), revoked: grant.revoked };
        function evaluatePolicy() {
          // Reuse reviewed core possession, non-anonymous identity, completion,
          // owner compatibility and max(score,0) rules. These ephemeral Maps are
          // policy evaluation only: discard the core's synthetic XP accumulator.
          // Actual account state comes exclusively from verified ledger SQL below.
          const tx = { sessions: new Map([[session.id, session]]), players: new Map([[player.id, player]]),
            guestSessions: new Map([[player.id, guestSession]]), claims: new Map(), xp: new Map() };
          const core = createClassroomCore({ repo: { transaction: fn => fn(tx) }, now: () => timestamp });
          return core.claim(proof, principal);
        }
        timestamp = await databaseNow(sql);
        const policy = evaluatePolicy(); // Authorize before any ledger/profile reads.
        const expected = { sessionId: session.id, playerId: player.id, userId: principal.userId,
          awarded: policy.awarded, reasonKey: `live_game:${player.id}`,
          subject: subjects.has(room.subject) ? room.subject : null };
        const claim = (await sql.query(`select player_id, session_id, user_id, event_id, awarded,
          reason_key, kind, subject, disposition from classroom_ledger_candidate_private.claims
          where player_id = $1 for share`, [player.id])).rows[0];
        // Intentionally search this player's reason across ALL destinations. The
        // legacy (user_id, reason_key) unique key does not prevent account swaps.
        const events = (await sql.query(`select id, user_id, reason_key, amount, kind, subject
          from public.xp_events where reason_key = $1 order by user_id, id for share`, [expected.reasonKey])).rows;
        if (events.length > 1 || (events.length === 1 && !exactEvent(events[0], expected))
            || (claim && (events.length !== 1 || !exactClaim(claim, events[0], expected)))) {
          fail('claim-reconciliation-required');
        }
        const profile = (await sql.query(`select user_id from public.user_profiles
          where user_id = $1 for key share`, [principal.userId])).rows[0];
        if (!profile) fail('account-profile-unavailable');
        const stats = (await sql.query(`select total_xp::text as total_xp from public.user_stats
          where user_id = $1 for update`, [principal.userId])).rows[0];
        const total = stats ? safeTotal(stats.total_xp) : 0n;
        if (events.length === 1 && (!stats || total < BigInt(expected.awarded))) fail('claim-reconciliation-required');
        if (events.length === 0 && total + BigInt(expected.awarded) > maxBigint) fail('xp-total-unavailable');
        // Recheck proof expiry after all locks, including potentially contended
        // account aggregate locks. Never authorize using transaction-start time.
        timestamp = await databaseNow(sql);
        evaluatePolicy();
        let disposition, event = events[0], totalXp = total.toString();
        if (claim) {
          disposition = 'replayed';
        } else {
          if (!event) {
            event = (await sql.query(`insert into public.xp_events (user_id, reason_key, amount, kind, subject)
              values ($1, $2, $3, 'xp', $4) returning id`,
            [principal.userId, expected.reasonKey, expected.awarded, expected.subject])).rows[0];
            disposition = 'awarded';
          } else {
            // Matching legacy event: acknowledge its existing award, never add it
            // to total_xp again. Presence/lower-bound safety is not a full audit of
            // the aggregate; the partial ledger cannot independently prove it.
            disposition = 'reconciled';
          }
          await sql.query(`insert into classroom_ledger_candidate_private.claims
            (player_id, session_id, user_id, event_id, awarded, reason_key, kind, subject, disposition)
            values ($1, $2, $3, $4, $5, $6, 'xp', $7, $8)`,
          [player.id, session.id, principal.userId, event.id, expected.awarded, expected.reasonKey, expected.subject, disposition]);
          if (disposition === 'awarded') {
            const saved = (await sql.query(`insert into public.user_stats (user_id, total_xp)
              values ($1, $2::bigint)
              on conflict (user_id) do update set total_xp = public.user_stats.total_xp + excluded.total_xp,
                updated_at = now()
              returning total_xp::text as total_xp`, [principal.userId, String(expected.awarded)])).rows[0];
            const savedTotal = safeTotal(saved?.total_xp);
            if (savedTotal !== total + BigInt(expected.awarded)) fail('xp-total-write-conflict');
            totalXp = savedTotal.toString();
          }
        }
        return { schemaVersion: 1, playerId: player.id, userId: principal.userId,
          awarded: expected.awarded, totalXp, disposition };
      });
    },
  });
}
