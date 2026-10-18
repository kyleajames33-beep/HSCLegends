# Proposed transport contract, not implemented endpoints

The browser imports `classroomTransport` from the client module. Its default is disabled and all methods reject. Tests inject a synthetic object at this import boundary. No API route or live fetch implementation is supplied.

## Credential and identity boundary

A future server join action must issue a high-entropy, expiring, revocable possession grant bound to one session and participant. A secure HttpOnly same-site cookie or an equivalently reviewed mechanism can carry it. This choice and issuance are unimplemented and untested. A game code and alias are inputs for creating a new guest participant, never evidence for recovering an old participant.

The request wrapper must retrieve and validate the grant independently, then construct the core proof. `Binding` fields sent by the client are selectors, not credentials. It must derive `principalId` from independently verified current authentication (null with no authenticated subject) and verify owner restrictions. It may never adopt principal identity from JSON or an unverified header. An authenticated subject, including any anonymous subject, does not automatically qualify for XP transfer. The secure page has no claim operation.

All methods must use uncached, no-store responses, avoid secret-bearing URLs, reject cross-origin/CSRF attempts as appropriate, and return only owned data. Backend error details must not be rendered by the page. Guest cookie issuance, login/logout transitions and origin protections require independent browser and security review.

## Operations

- `join({code, alias}) -> Binding`: creates a guest-capable participant/grant without requiring a permanent account. A duplicate alias cannot select an existing participant. No issuer is implemented here.
- `restore() -> Binding`: recovers only a grant already possessed by this browser. No alias/code recovery argument exists. Lost/expired/revoked/unissued grants fail closed.
- `ownSnapshot(binding) -> Snapshot`: discover current index under the session lock, perform owned validation, and return the scoped service's public snapshot plus independently verified `principalId`.
- `submit(binding, {index, choice}) -> {schemaVersion:1, ...Binding, ownReceipt}`: submit or replay the immutable receipt. A replay may return an originally accepted choice different from the new request. Never recalculate the receipt against a mutable bank.
- `ownStanding(binding) -> {schemaVersion:1, ...Binding, rank, score}`: available only for a complete session. The response has no roster or peer alias.
- `watch(binding, changed) -> unsubscribe`, optional: notifications are invalidation hints only. Every hint causes an owned snapshot read; no notification payload is trusted as game state. Otherwise manual refresh remains available.

`Snapshot` matches the reviewed scoped `ownSnapshot` service: schemaVersion, sessionId, playerId, status, index, question, contentStatus, ownReceipt, total, startedAt, durationMs, isDouble, plus principalId from the separate trusted request wrapper.

`total` may be null when sealed-set metadata is unavailable. Historical/complete views do not need a guessed total. An actionable unanswered question requires verified non-null timing, total and content. A completed room can use index equal to the former question count and return no question/receipt. It is a terminal summary, not a request for a nonexistent next question.

There is no verified server revision column in this candidate. No monotonic revision is fabricated. The client uses request generations, connection epochs, identity binding, non-regressing observed index/completion and immutable accepted receipt evidence. The server's locked, non-cached current-state contract is still required.

## XP hold

The transport deliberately has no claim method. The existing product contract remains untouched in the legacy page and must be reconciled with an independently reviewed ledger adapter before enabling secure-path saving. The UI never reports XP saved from a score, a local cache or an unverified replacement result.
