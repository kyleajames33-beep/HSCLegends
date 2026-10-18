# Proposed transport contract, not implemented endpoints

The browser imports `classroomTransport` from the client module. Its default is disabled and all methods reject. Tests inject a synthetic object at this import boundary. No API route or live fetch implementation is supplied.

## Credential and identity boundary

A future server join action must issue a high-entropy, expiring, revocable possession grant bound to one session and participant. A secure HttpOnly same-site cookie or an equivalently reviewed mechanism can carry it. The unmounted guest-session and HTTP-boundary modules now implement and locally test issuance with a Secure, HttpOnly, SameSite=Lax __Host-classroom_session cookie. No route, configured auth/SQL connection or browser transport is enabled; hosted issuance remains untested. See HTTP-BOUNDARY.md. A game code and alias are inputs for creating a new guest participant, never evidence for recovering an old participant.

The request wrapper must retrieve and validate the grant independently, then construct the core proof. `Binding` fields sent by the client are selectors, not credentials. It must derive `principalId` from independently verified current authentication (null with no authenticated subject) and verify owner restrictions. It may never adopt principal identity from JSON or an unverified header. An authenticated subject, including any anonymous subject, does not automatically qualify for XP transfer. The secure page has no claim operation.

All methods must use uncached, no-store responses, avoid secret-bearing URLs, reject cross-origin/CSRF attempts as appropriate, and return only owned data. Backend error details must not be rendered by the page. Guest cookie issuance, login/logout transitions and origin protections require independent browser and security review.

## Operations

- `join({code, alias}) -> Binding`: creates a guest-capable participant/grant without requiring a permanent account. A duplicate alias cannot select an existing participant. The unmounted guest service implements the issuer; no live transport is connected.
- `restore() -> Binding`: recovers only a grant already possessed by this browser. No alias/code recovery argument exists. Lost/expired/revoked/unissued grants fail closed.
- `leave({intent: 'revoke-session' | 'forget-browser'}) -> {schemaVersion:1, disposition:'left-this-device'}`: separate explicit confirmations, as described below. This is a cookie operation, not a participant-ID request.
- `ownSnapshot(binding) -> Snapshot`: discover current index under the session lock, perform owned validation, and return the scoped service's public snapshot plus independently verified `principalId`.
- `submit(binding, {index, choice}) -> {schemaVersion:1, ...Binding, ownReceipt}`: submit or replay the immutable receipt. A replay may return an originally accepted choice different from the new request. Never recalculate the receipt against a mutable bank.
- `ownStanding(binding) -> {schemaVersion:1, ...Binding, rank, score}`: available only for a complete session. The response has no roster or peer alias.
- `watch(binding, changed) -> unsubscribe`, optional: notifications are invalidation hints only. Every hint causes an owned snapshot read; no notification payload is trusted as game state. Otherwise manual refresh remains available.

`Snapshot` matches the reviewed scoped `ownSnapshot` service: schemaVersion, sessionId, playerId, status, index, question, contentStatus, ownReceipt, total, startedAt, durationMs, isDouble, plus principalId from the separate trusted request wrapper.

`total` may be null when sealed-set metadata is unavailable. Historical/complete views do not need a guessed total. An actionable unanswered question requires verified non-null timing, total and content. A completed room can use index equal to the former question count and return no question/receipt. It is a terminal summary, not a request for a nonexistent next question.

There is no verified server revision column in this candidate. No monotonic revision is fabricated. The client uses request generations, connection epochs, identity binding, non-regressing observed index/completion and immutable accepted receipt evidence. The server's locked, non-cached current-state contract is still required.

## Explicit leave and switching games

The secure page never silently replaces an existing recovery cookie. Leave controls
are available even before a binding exists, including failed restore. Cancel keeps the
current game, receipt and recovery unchanged. `Play another` opens confirmation instead
of silently resetting the client while retaining the previous room's cookie.

- `revoke-session`: after confirmation, the HTTP boundary calls the trusted guest
  service. Only `revoked` or `already-inactive` clears the cookie. Ownership mismatch,
  malformed cookie, auth failure, database failure or invalid outcome preserves it.
- `forget-browser`: a different confirmation explicitly states that only this browser's
  recovery cookie is discarded and the server session is not revoked. After fixed-origin,
  method, CSRF/Fetch-Metadata, strict body and shared source-budget checks, this operation
  deliberately skips cookie parsing, auth and database access. This lets users escape a
  malformed/foreign/expired cookie or auth outage without adopting/revoking another owner.
- There is no automatic fallback between these modes. Both successful responses expose
  only the generic device-left acknowledgement. Submitted answers/points are not deleted.

The unmounted HTTP method is POST `/api/classroom-candidate/leave` with exactly one string
field `intent` and either value above. Successful responses clear only the host recovery
cookie with Secure, HttpOnly, SameSite=Lax, Path=/ and Max-Age=0. Failures emit no clearing
Set-Cookie header. A lost/truncated success response may nevertheless have applied the
browser's clearing header before its JSON acknowledgement fails; the UI does not promise
that the cookie survives an unknown network outcome. A lost revoke acknowledgement is safe to retry because already-inactive
is idempotent. The client retains binding details for retry on unknown failure and locks
stale question controls rather than treating an old snapshot as still authoritative.

The controller serializes its own join/leave cookie mutations, including through identity
changes and reset, and invalidates older reads/answers when leave begins. This does not
solve HTTP Set-Cookie ordering across tabs or a destroyed/new controller: epochs protect
client JSON handling, not browser cookie headers. The eventual real browser transport
must define and test cross-tab/remount cookie-operation coordination before activation.
No such network transport or browser-cookie integration is claimed by the synthetic tests.

## XP hold

The transport deliberately has no claim method. The existing product contract remains untouched in the legacy page and must be reconciled with an independently reviewed ledger adapter before enabling secure-path saving. The UI never reports XP saved from a score, a local cache or an unverified replacement result.
