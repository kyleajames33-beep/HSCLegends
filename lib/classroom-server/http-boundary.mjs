import { createHash } from 'node:crypto';

// Unmounted local candidate: no routes, environment wiring, credentials, cookies
// or grants are created by importing this module. All adapters are mandatory.
export const CLASSROOM_COOKIE = '__Host-classroom_session';
export const CLASSROOM_HTTP_PATHS = Object.freeze({
  join: '/api/classroom-candidate/join', restore: '/api/classroom-candidate/restore',
  ownSnapshot: '/api/classroom-candidate/snapshot', submit: '/api/classroom-candidate/submit',
  ownStanding: '/api/classroom-candidate/standing', leave: '/api/classroom-candidate/leave',
});
const methods = { join: 'POST', restore: 'POST', ownSnapshot: 'GET', submit: 'POST', ownStanding: 'GET', leave: 'POST' };
const BODY_BYTES = 1024;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const int = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
class HttpFault extends Error {
  constructor(status, code, headers = {}) { super(code); this.status = status; this.code = code; this.headers = headers; }
}
const deny = () => { throw new HttpFault(403, 'session_unavailable'); };
const bad = () => { throw new HttpFault(400, 'invalid_request'); };
const unavailable = () => { throw new HttpFault(503, 'service_unavailable'); };
function canonicalSecret(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
    && Buffer.from(value, 'base64url').length === 32 && Buffer.from(value, 'base64url').toString('base64url') === value;
}
function cookieSecret(request) {
  const header = request.headers.get('cookie');
  if (header === null) return null;
  if (!header || Buffer.byteLength(header, 'utf8') > 8192 || /[^\x20-\x7E]/.test(header)) deny();
  const names = new Set(); let secret = null;
  for (const segment of header.split(';')) {
    const entry = segment.trim(); const equal = entry.indexOf('=');
    if (equal <= 0) deny();
    const name = entry.slice(0, equal), value = entry.slice(equal + 1);
    // Reject duplicate names, quoted/encoded proof variants, commas introduced by
    // multiple Cookie headers, and malformed cookie syntax. Never URL-decode proof.
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || names.has(name)
      || !/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/.test(value)) deny();
    names.add(name);
    if (name === CLASSROOM_COOKIE) { if (!canonicalSecret(value)) deny(); secret = value; }
  }
  return secret;
}
function strictFlatJson(text) {
  // A bounded, shallow JSON grammar detects duplicate keys (including escaped
  // aliases of the same key). JSON.parse alone would silently keep the last one.
  let value;
  try { value = JSON.parse(text); } catch { bad(); }
  if (!record(value)) bad();
  let offset = 0; const names = new Set();
  const space = () => { while (/[\t\n\r ]/.test(text[offset] ?? '') && offset < text.length) offset++; };
  const string = /"(?:[^"\\\u0000-\u001F]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const token = expression => { expression.lastIndex = offset; const found = expression.exec(text); if (!found) bad(); offset = expression.lastIndex; return found[0]; };
  space(); if (text[offset++] !== '{') bad(); space();
  if (text[offset] !== '}') for (;;) {
    const name = JSON.parse(token(string)); if (names.has(name)) bad(); names.add(name);
    space(); if (text[offset++] !== ':') bad(); space();
    if (text[offset] === '"') token(string); else token(number);
    space(); if (text[offset] === '}') break;
    if (text[offset++] !== ',') bad(); space();
  }
  if (text[offset++] !== '}') bad(); space(); if (offset !== text.length) bad();
  return value;
}
async function body(request, timeoutMs) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')
    || request.headers.has('content-encoding') || request.headers.has('transfer-encoding')) bad();
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader !== null && (!/^(0|[1-9][0-9]{0,5})$/.test(lengthHeader) || Number(lengthHeader) > BODY_BYTES)) bad();
  if (!request.body || request.bodyUsed) bad();
  const reader = request.body.getReader(); let size = 0, succeeded = false; const chunks = []; let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new HttpFault(408, 'invalid_request')), timeoutMs); });
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) bad();
      size += part.value.byteLength; if (size > BODY_BYTES) bad(); chunks.push(part.value);
    }
    if (lengthHeader !== null && size !== Number(lengthHeader)) bad();
    const bytes = Buffer.concat(chunks, size);
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { bad(); }
    const value = strictFlatJson(text); succeeded = true; return value;
  } finally {
    clearTimeout(timer);
    // Do not wait indefinitely for an adversarial stream's cancellation hook.
    if (!succeeded) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function inputFor(operation, value) {
  const keys = Object.keys(value).sort().join(',');
  if (operation === 'leave') {
    if (keys !== 'intent' || !['revoke-session', 'forget-browser'].includes(value.intent)) bad();
    return { intent: value.intent };
  }
  if (operation === 'restore') { if (keys !== '') bad(); return {}; }
  if (operation === 'join') {
    if (keys !== 'alias,code' || typeof value.code !== 'string' || !/^[A-Z0-9]{6}$/.test(value.code)
      || typeof value.alias !== 'string' || value.alias !== value.alias.trim() || !value.alias
      || value.alias.length > 20 || Buffer.byteLength(value.alias, 'utf8') > 80 || /\p{C}/u.test(value.alias)) bad();
    return { code: value.code, alias: value.alias };
  }
  if (keys !== 'choice,index' || !int(value.index, 0, 32767) || !int(value.choice, 0, 31)) bad();
  return { index: value.index, choice: value.choice };
}
function account(value) {
  if (value === null) return null;
  if (!record(value) || !uuid(value.userId) || typeof value.isAnonymous !== 'boolean') unavailable();
  return Object.freeze({ userId: value.userId.toLowerCase(), isAnonymous: value.isAnonymous });
}
function owned(value, principal, expectedSecret, now) {
  if (!record(value) || !record(value.proof) || !uuid(value.proof.sessionId) || !uuid(value.proof.playerId)
    || !canonicalSecret(value.proof.secret) || (expectedSecret !== null && value.proof.secret !== expectedSecret)
    || (value.ownerId !== null && !uuid(value.ownerId)) || !int(value.expiresAt) || value.expiresAt <= now) deny();
  // Guest possession survives optional sign-in without silently assigning owner.
  // Already-owned participants require the same independently verified account.
  if (value.ownerId !== null && (value.ownerId !== principal?.userId || principal?.isAnonymous !== false)) deny();
  // Carry the server-resolved owner into the scoped transaction. The service
  // rechecks it under its player lock so a concurrent ownership writer cannot change the
  // owner between resolution and the subsequent private read or submission.
  return { proof: Object.freeze({ sessionId: value.proof.sessionId, playerId: value.proof.playerId,
    secret: value.proof.secret, expectedOwnerId: value.ownerId }),
    expiresAt: value.expiresAt, binding: { sessionId: value.proof.sessionId, playerId: value.proof.playerId, principalId: principal?.userId ?? null } };
}
function receipt(value, index) {
  if (!record(value) || value.questionIndex !== index || !int(value.acceptedChoice, 0, 31)
    || typeof value.isCorrect !== 'boolean' || !int(value.points) || !int(value.answeredAt)) unavailable();
  if (value.keyProvenance === 'frozen') {
    if (!int(value.correctIndex, 0, 31) || typeof value.contentRevision !== 'string' || !value.contentRevision || value.contentRevision.length > 256
      || (value.acceptedChoice === value.correctIndex) !== value.isCorrect) unavailable();
  } else if (value.keyProvenance !== 'legacy-unavailable' || value.correctIndex !== null || value.contentRevision !== null) unavailable();
  return { questionIndex: index, acceptedChoice: value.acceptedChoice, isCorrect: value.isCorrect, points: value.points,
    answeredAt: value.answeredAt, correctIndex: value.correctIndex, contentRevision: value.contentRevision, keyProvenance: value.keyProvenance };
}
function snapshot(value, binding) {
  if (!record(value) || value.schemaVersion !== 1 || value.sessionId !== binding.sessionId || value.playerId !== binding.playerId
    || !['lobby', 'active', 'complete'].includes(value.status) || !int(value.index, -1, 32767)
    || (value.total !== null && !int(value.total, 1, 32767)) || (value.startedAt !== null && !int(value.startedAt))
    || (value.durationMs !== null && !int(value.durationMs, 1)) || typeof value.isDouble !== 'boolean') unavailable();
  let question = null;
  if (value.question !== null) {
    const q = value.question;
    if (!record(q) || typeof q.stem !== 'string' || !q.stem || q.stem.length > 16000 || !Array.isArray(q.options)
      || q.options.length < 2 || q.options.length > 32 || !q.options.every(s => typeof s === 'string' && s.length <= 4096)
      || typeof q.contentRevision !== 'string' || !q.contentRevision || q.contentRevision.length > 256) unavailable();
    question = { stem: q.stem, options: [...q.options], contentRevision: q.contentRevision };
  }
  const ownReceipt = value.ownReceipt === null ? null : receipt(value.ownReceipt, value.index);
  if (ownReceipt?.keyProvenance === 'legacy-unavailable') {
    if (value.contentStatus !== 'historical-content-unavailable' || question !== null) unavailable();
  } else if (ownReceipt) {
    if (value.contentStatus !== 'frozen' || !question || ownReceipt.contentRevision !== question.contentRevision
      || ownReceipt.correctIndex >= question.options.length || ownReceipt.acceptedChoice >= question.options.length) unavailable();
  } else if (value.contentStatus !== 'current-session') unavailable();
  if (value.status === 'active' && (value.index < 0 || (value.total !== null && value.index >= value.total)
    || (!ownReceipt && (!question || value.total === null || value.startedAt === null || value.durationMs === null)))) unavailable();
  if (value.status === 'lobby' && (value.index !== -1 || ownReceipt !== null || question !== null)) unavailable();
  if (value.status === 'complete' && (question !== null || ownReceipt !== null)) unavailable();
  return { schemaVersion: 1, ...binding, status: value.status, index: value.index, total: value.total,
    startedAt: value.startedAt, durationMs: value.durationMs, isDouble: value.isDouble,
    question, ownReceipt, contentStatus: value.contentStatus };
}
function response(payload, status = 200, additional = {}, secret = null) {
  const json = JSON.stringify(payload);
  if (secret && json.includes(secret)) unavailable();
  return new Response(json, { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private, max-age=0',
    Pragma: 'no-cache', Expires: '0', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin', Vary: 'Origin, Cookie, Sec-Fetch-Site', ...additional,
  } });
}

export function createClassroomHttpBoundary({ origin, guestSessions, classroom, verifyAccount, rateLimiter, trustedSourceKey, now = Date.now, bodyTimeoutMs = 1000 }) {
  let configured;
  try { configured = new URL(origin); } catch { throw new TypeError('A configured HTTPS origin is required'); }
  if (configured.protocol !== 'https:' || configured.username || configured.password || configured.pathname !== '/'
    || configured.search || configured.hash || !int(bodyTimeoutMs, 1, 5000)) throw new TypeError('Invalid HTTP boundary configuration');
  const allowedOrigin = configured.origin;
  if (!guestSessions || !classroom || typeof guestSessions.join !== 'function' || typeof guestSessions.resolve !== 'function' || typeof guestSessions.leave !== 'function'
    || !['ownSnapshot', 'submit', 'ownStanding'].every(key => typeof classroom[key] === 'function')
    || typeof verifyAccount !== 'function' || typeof rateLimiter?.consumeAtomic !== 'function'
    || typeof trustedSourceKey !== 'function' || typeof now !== 'function') throw new TypeError('Missing trusted boundary adapters');
  // consumeAtomic MUST use a shared atomic store across workers/processes. No
  // per-process or permissive fallback is supplied. trustedSourceKey receives
  // only server-owned context, never a Request or caller-selected XFF header.
  // Each join consumes both source and room-code budgets. This prevents a
  // rotating-source attacker from bypassing the room's shared admission budget.
  // The injected adapter must atomically enforce policy for EVERY scope; an
  // unrecognised scope or shared-store failure must throw or deny, never allow.
  async function consume(key, operation, scope) {
    let limit;
    try { limit = await rateLimiter.consumeAtomic({ key, operation, scope }); } catch { unavailable(); }
    if (!record(limit) || typeof limit.allowed !== 'boolean') unavailable();
    if (!limit.allowed) throw new HttpFault(429, 'rate_limited', int(limit.retryAfterSeconds, 1, 3600) ? { 'Retry-After': String(limit.retryAfterSeconds) } : {});
  }
  async function handle(operation, request, trustedContext) {
    try {
      if (!(request instanceof Request)) bad();
      const url = new URL(request.url);
      if (url.origin !== allowedOrigin || url.username || url.password || url.search || url.hash
        || url.pathname !== CLASSROOM_HTTP_PATHS[operation]) throw new HttpFault(403, 'request_not_allowed');
      const method = methods[operation];
      if (request.method !== method) throw new HttpFault(405, 'method_not_allowed', { Allow: method });
      const suppliedOrigin = request.headers.get('origin');
      if ((method === 'POST' || suppliedOrigin !== null) && suppliedOrigin !== allowedOrigin) throw new HttpFault(403, 'request_not_allowed');
      if (request.headers.get('sec-fetch-site') !== 'same-origin'
        || !['cors', 'same-origin'].includes(request.headers.get('sec-fetch-mode'))
        || request.headers.get('sec-fetch-dest') !== 'empty' || request.headers.has('sec-fetch-user')) throw new HttpFault(403, 'request_not_allowed');
      if (method === 'GET' && (request.body !== null || request.headers.has('content-type')
        || (request.headers.has('content-length') && request.headers.get('content-length') !== '0'))) bad();
      let source;
      try { source = await trustedSourceKey(trustedContext); } catch { unavailable(); }
      if (typeof source !== 'string' || !source || source.length > 256 || /[\x00-\x20\x7F]/.test(source)) unavailable();
      const key = createHash('sha256').update('classroom-http-v1\0' + allowedOrigin + '\0' + source).digest('hex');
      await consume(key, operation, 'source');
      const input = method === 'POST' ? inputFor(operation, await body(request, bodyTimeoutMs)) : {};
      // Forgetting this browser is explicitly confirmed and is NOT revocation.
      // It must remain possible with a malformed cookie or unavailable auth.
      const cleared = () => response({ schemaVersion: 1, disposition: 'left-this-device' }, 200, {
        'Set-Cookie': `${CLASSROOM_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
      });
      if (operation === 'leave' && input.intent === 'forget-browser') return cleared();
      const secret = cookieSecret(request);
      if (operation === 'join') await consume(createHash('sha256').update('classroom-http-v1-room\0' + allowedOrigin + '\0' + input.code).digest('hex'), operation, 'room');
      let principal;
      try { principal = account(await verifyAccount(request, trustedContext)); } catch { unavailable(); }
      if (operation === 'leave') {
        if (secret !== null) {
          const outcome = await guestSessions.leave(secret, { trustedPrincipal: principal });
          if (!record(outcome) || typeof outcome.revoked !== 'boolean') unavailable();
          if (outcome.disposition === 'ownership-mismatch' && outcome.revoked === false) deny();
          if (!((outcome.disposition === 'revoked' && outcome.revoked === true)
            || (outcome.disposition === 'already-inactive' && outcome.revoked === false))) unavailable();
        }
        return cleared();
      }
      const currentTime = () => { const timestamp = now(); if (!int(timestamp)) unavailable(); return timestamp; };
      if (operation === 'join') {
        const grant = owned(await guestSessions.join(input, { cookieSecret: secret, trustedPrincipal: principal }), principal, secret, currentTime());
        const maxAge = Math.min(21600, Math.floor((grant.expiresAt - now()) / 1000));
        if (!int(maxAge, 1, 21600)) deny();
        // Lost response semantics: if Set-Cookie reached the browser, retry reuses
        // that exact grant. If it never reached the browser, identity cannot be
        // recovered by alias. A fresh join can create a new participant. No
        // rotation, revocation, broad cleanup or exactly-once join is implied.
        return response({ schemaVersion: 1, ...grant.binding }, 200, {
          'Set-Cookie': `${CLASSROOM_COOKIE}=${grant.proof.secret}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
        }, grant.proof.secret);
      }
      if (!secret) deny();
      const grant = owned(await guestSessions.resolve(secret), principal, secret, currentTime());
      if (operation === 'restore') return response({ schemaVersion: 1, ...grant.binding }, 200, {}, secret);
      if (operation === 'ownSnapshot') return response(snapshot(await classroom.ownSnapshot(grant.proof), grant.binding), 200, {}, secret);
      if (operation === 'submit') return response({ schemaVersion: 1, ...grant.binding,
        ownReceipt: receipt(await classroom.submit(grant.proof, input), input.index) }, 200, {}, secret);
      const standing = await classroom.ownStanding(grant.proof);
      if (!record(standing) || !int(standing.rank, 1) || !int(standing.score)) unavailable();
      return response({ schemaVersion: 1, ...grant.binding, rank: standing.rank, score: standing.score }, 200, {}, secret);
    } catch (error) {
      if (error instanceof HttpFault) return response({ error: error.code }, error.status, error.headers);
      if (error?.code === 'forbidden') return response({ error: 'session_unavailable' }, 403);
      if (['invalid-choice', 'invalid-question', 'stale-question', 'answer-window-closed', 'not-complete'].includes(error?.code)) return response({ error: 'game_state_changed' }, 409);
      // Do not echo backend exceptions, credentials, grant metadata or existence.
      return response({ error: 'service_unavailable' }, 503);
    }
  }
  return Object.freeze(Object.fromEntries(Object.keys(methods).map(operation => [operation, (request, trustedContext) => handle(operation, request, trustedContext)])));
}
