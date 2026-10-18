import { randomBytes } from 'node:crypto';
import { ClassroomError, hashSessionSecret, sealSessionQuestions } from './classroom-core.mjs';

// Unmounted server-side candidate. No connection, credential or grant is created
// by importing this module. Runtime must inject a connection-pinned SERIALIZABLE
// runner and a synchronous cryptographic secret factory. Tests inject only public,
// deterministic synthetic values; they never invoke the factory below.
export function createCryptographicGuestSecret() {
  return randomBytes(32).toString('base64url');
}
const fail = code => { throw new ClassroomError(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const maxTtlMs = 6 * 60 * 60 * 1000;
const ms = value => value == null ? null : new Date(value).getTime();
const clockSql = 'select floor(extract(epoch from clock_timestamp()) * 1000)::bigint as now_ms';
async function databaseNow(sql) {
  const value = Number((await sql.query(clockSql)).rows[0]?.now_ms);
  if (!Number.isSafeInteger(value)) fail('database-clock-unavailable');
  return value;
}
function validSecret(secret) {
  return typeof secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(secret)
    && Buffer.from(secret, 'base64url').length === 32
    && Buffer.from(secret, 'base64url').toString('base64url') === secret;
}
function digestSecret(secret, code = 'forbidden') {
  if (!validSecret(secret)) fail(code);
  return hashSessionSecret(secret);
}
function normalizeJoin(input) {
  if (typeof input?.code !== 'string' || input.code.length > 64
      || typeof input?.alias !== 'string' || input.alias.length > 128) fail('invalid-join');
  const code = input.code.trim().toUpperCase(), alias = input.alias.trim();
  // These candidate bounds match the existing six-character code and 20-code-
  // unit alias UI. No alias normalization is ever used as ownership evidence.
  if (!/^[A-Z0-9]{6}$/.test(code) || alias.length < 1 || alias.length > 20
      || /[\u0000-\u001f\u007f-\u009f]/.test(alias)) fail('invalid-join');
  return { code, alias };
}
function verifiedPrincipalId(principal) {
  if (principal == null) return null;
  if (!uuid(principal.userId) || typeof principal.isAnonymous !== 'boolean') fail('forbidden');
  return principal.userId.toLowerCase();
}
function liveRoom(room, timestamp) {
  return room && Number.isSafeInteger(ms(room.expires_at)) && timestamp < ms(room.expires_at);
}
function validLockedGrant(grant, room, timestamp) {
  return liveRoom(room, timestamp) && grant && !grant.revoked
    && grant.session_id === room.id && uuid(grant.player_id)
    && Number.isSafeInteger(ms(grant.expires_at)) && timestamp < ms(grant.expires_at);
}
function validGrant(grant, room, player, timestamp) {
  return validLockedGrant(grant, room, timestamp) && player
    && player.session_id === room.id && grant.player_id === player.id;
}
function envelope(room, grant, player, secret, reused) {
  return { proof: { sessionId: room.id, playerId: player.id, secret },
    ownerId: player.user_id, expiresAt: Math.min(ms(grant.expires_at), ms(room.expires_at)), reused };
}
function verifiedSet(payload, questionIds) {
  if (!payload || payload.version !== 1 || !Array.isArray(questionIds)) fail('unverified-question');
  const sealed = sealSessionQuestions(payload.questions);
  if (sealed.fingerprint !== payload.fingerprint || sealed.questions.length !== questionIds.length) fail('unverified-question');
}

/**
 * join({code,alias}, {cookieSecret, trustedPrincipal}) returns an INTERNAL
 * {proof,ownerId,expiresAt,reused}. Only the HTTP layer may place proof.secret in
 * its Secure/HttpOnly cookie; it must never put this object directly in JSON.
 * principal must come from independently verified server authentication.
 *
 * Existing valid same-room possession is an idempotent retry with unchanged
 * alias/owner/score/hash/expiry. A non-null owner mismatch, invalid/expired cookie and
 * another-room cookie fail closed; no implicit rebind or credential reset exists.
 * With no cookie, a new join always creates a new player even when aliases match.
 * A lost response before the browser receives its cookie can therefore leave an
 * orphan player and an explicit retry can create another. Alias-based dedupe
 * would wrongly claim another participant and is deliberately not implemented.
 *
 * resolve(secret) accepts no client IDs or principal. It derives proof and owner
 * from the uniquely hashed cookie. The HTTP layer MUST compare ownerId exactly
 * with its independently verified current principal when ownerId is non-null;
 * a null guest owner may retain possession after a separately verified sign-in,
 * and scoped operations must revalidate proof expiry/revocation in their own tx.
 *
 * leave(secret, {trustedPrincipal}) is called only for the explicitly confirmed
 * revoke-session intent. Its INTERNAL result is {revoked,disposition}; no IDs or
 * secrets are returned. An active owned grant requires the exact nonanonymous
 * owner to revoke. Owner mismatch is an explicit no-mutation outcome; HTTP must
 * reject it and preserve its cookie. Unknown, revoked or expired possession is
 * idempotently already-inactive. HTTP keeps dispositions private and clears its
 * cookie only on revoked/already-inactive. Authentication/transaction failures
 * preserve state. A separate explicitly confirmed forget-browser intent may
 * discard just the local cookie without calling this method or claiming server
 * revocation. Leave never changes the player, owner, score or receipts.
 */
export function createGuestSessionService({ runTransaction, createSecret, ttlMs = maxTtlMs }) {
  if (typeof runTransaction !== 'function' || typeof createSecret !== 'function') throw new TypeError('Missing trusted guest-session adapters');
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > maxTtlMs) throw new TypeError('Invalid guest-session TTL');
  return Object.freeze({
    async join(input, context = {}) {
      const { code, alias } = normalizeJoin(input);
      const principalId = verifiedPrincipalId(context?.trustedPrincipal);
      // Existing anonymous Auth is still a guest, not a claim-capable account.
      const isAnonymous = context?.trustedPrincipal?.isAnonymous;
      const ownerId = isAnonymous === true ? null : principalId;
      const cookieSecret = context?.cookieSecret ?? null;
      const cookieDigest = cookieSecret === null ? null : digestSecret(cookieSecret);
      return runTransaction(async sql => {
        // Room lock precedes every mutation and any guest/player row locks.
        // Lobby/active acceptance is explicit replacement policy, not a claim
        // that the entire legacy join_game implementation was reconstructed.
        const room = (await sql.query(`select id, status, expires_at, question_ids from public.game_sessions
          where code = $1 for share`, [code])).rows[0];
        let timestamp = await databaseNow(sql);
        if (!liveRoom(room, timestamp) || !['lobby', 'active'].includes(room.status)) fail('room-unavailable');
        if (cookieDigest !== null) {
          const grant = (await sql.query(`select player_id, session_id, secret_hash, expires_at, revoked
            from classroom_candidate_private.guest_sessions
            where session_id = $1 and secret_hash = $2 for share`, [room.id, cookieDigest])).rows[0];
          timestamp = await databaseNow(sql);
          // Reject invalid possession before reading the player's private owner.
          if (!validLockedGrant(grant, room, timestamp)) fail('forbidden');
          const player = (await sql.query(`select id, session_id, user_id from public.game_players
            where session_id = $1 and id = $2 for share`, [room.id, grant.player_id])).rows[0];
          timestamp = await databaseNow(sql);
          if (!validGrant(grant, room, player, timestamp) || (player.user_id !== null && (player.user_id !== principalId || isAnonymous !== false))) fail('forbidden');
          return envelope(room, grant, player, cookieSecret, true);
        }
        // Secure new joins require a sealed immutable set even in the lobby.
        // Legacy unsealed rooms remain on the legacy flow; no lazy freezing here.
        const set = (await sql.query(`select payload from classroom_candidate_private.question_sets
          where session_id = $1 for share`, [room.id])).rows[0];
        verifiedSet(set?.payload, room.question_ids);
        timestamp = await databaseNow(sql); // after all blocking pre-insert reads
        if (!liveRoom(room, timestamp)) fail('room-unavailable');
        const secret = createSecret(); // synchronous, ≥256 bits CSPRNG at runtime
        const digest = digestSecret(secret, 'session-secret-unavailable');
        const expiresAt = Math.min(ms(room.expires_at), timestamp + ttlMs);
        if (!Number.isSafeInteger(expiresAt) || expiresAt <= timestamp) fail('room-unavailable');
        const player = (await sql.query(`insert into public.game_players (session_id, user_id, alias)
          values ($1, $2, $3) returning id, session_id, user_id`, [room.id, ownerId, alias])).rows[0];
        const grant = (await sql.query(`insert into classroom_candidate_private.guest_sessions
          (player_id, session_id, secret_hash, expires_at, revoked)
          values ($1, $2, $3, $4, false)
          returning player_id, session_id, expires_at, revoked`,
        [player.id, room.id, digest, new Date(expiresAt).toISOString()])).rows[0];
        // INSERT/FK/unique checks can also block. Expiry remains based on the
        // earlier acceptance timestamp and is never refreshed by a delayed write.
        timestamp = await databaseNow(sql);
        if (!validGrant(grant, room, player, timestamp)) fail('forbidden');
        return envelope(room, grant, player, secret, false);
      });
    },
    async resolve(secret) {
      const digest = digestSecret(secret);
      return runTransaction(async sql => {
        // Discovery is an unlocked unique-hash read only. Then lock in the same
        // session -> grant -> player order as every scoped service. Re-read the
        // grant under lock; never trust discovery as authorization.
        const matches = (await sql.query(`select player_id, session_id from classroom_candidate_private.guest_sessions
          where secret_hash = $1`, [digest])).rows;
        if (matches.length !== 1) fail('forbidden');
        const selected = matches[0];
        const room = (await sql.query(`select id, status, expires_at from public.game_sessions
          where id = $1 for share`, [selected.session_id])).rows[0];
        const grant = (await sql.query(`select player_id, session_id, secret_hash, expires_at, revoked
          from classroom_candidate_private.guest_sessions
          where session_id = $1 and player_id = $2 and secret_hash = $3 for share`,
        [selected.session_id, selected.player_id, digest])).rows[0];
        let timestamp = await databaseNow(sql);
        // Discovery alone is insufficient: validate locked possession/expiry
        // before reading the player's private account binding.
        if (!validLockedGrant(grant, room, timestamp)) fail('forbidden');
        const player = (await sql.query(`select id, session_id, user_id from public.game_players
          where session_id = $1 and id = $2 for share`, [selected.session_id, selected.player_id])).rows[0];
        timestamp = await databaseNow(sql);
        if (!validGrant(grant, room, player, timestamp)) fail('forbidden');
        const result = envelope(room, grant, player, secret, true);
        // Restore does not carry join's retry flag; all fields are server-owned.
        return { proof: result.proof, ownerId: result.ownerId, expiresAt: result.expiresAt };
      });
    },
    async leave(secret, context = {}) {
      const digest = digestSecret(secret);
      // Copy the independently verified principal before any asynchronous work.
      const principalId = verifiedPrincipalId(context?.trustedPrincipal);
      const isAnonymous = context?.trustedPrincipal?.isAnonymous;
      const inactive = () => ({ revoked: false, disposition: 'already-inactive' });
      return runTransaction(async sql => {
        // Unique-hash discovery confers no authority. Re-read under locks in
        // session -> grant -> player order, compatible with scoped operations.
        const matches = (await sql.query(`select player_id, session_id from classroom_candidate_private.guest_sessions
          where secret_hash = $1`, [digest])).rows;
        if (matches.length === 0) return inactive();
        if (matches.length !== 1) fail('forbidden');
        const selected = matches[0];
        const room = (await sql.query(`select id, status, expires_at from public.game_sessions
          where id = $1 for share`, [selected.session_id])).rows[0];
        const grant = (await sql.query(`select player_id, session_id, secret_hash, expires_at, revoked
          from classroom_candidate_private.guest_sessions
          where session_id = $1 and player_id = $2 and secret_hash = $3 for update`,
        [selected.session_id, selected.player_id, digest])).rows[0];
        let timestamp = await databaseNow(sql);
        // Inactive possession needs no private account read and no mutation.
        if (!validLockedGrant(grant, room, timestamp)) return inactive();
        const player = (await sql.query(`select id, session_id, user_id from public.game_players
          where session_id = $1 and id = $2 for share`, [selected.session_id, selected.player_id])).rows[0];
        timestamp = await databaseNow(sql);
        if (!validLockedGrant(grant, room, timestamp)) return inactive();
        if (!validGrant(grant, room, player, timestamp)) fail('forbidden');
        if (player.user_id !== null && (player.user_id !== principalId || isAnonymous !== false)) {
          return { revoked: false, disposition: 'ownership-mismatch' };
        }
        const changed = (await sql.query(`update classroom_candidate_private.guest_sessions set revoked = true
          where session_id = $1 and player_id = $2 and secret_hash = $3 and revoked = false returning revoked`,
        [room.id, player.id, digest])).rows;
        if (changed.length !== 1 || changed[0].revoked !== true) fail('forbidden');
        return { revoked: true, disposition: 'revoked' };
      });
    },
  });
}
