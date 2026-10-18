# Scoped transactional adapter candidate

Local, unconnected review candidate, 2026-10-18. This adds an operation-scoped SQL adapter around the unchanged reviewed policy core. It is not a deployable endpoint, a migration, an authorization grant, or a completed application fix. No database URL, credential, production connection, grant or deployment is created by these files.

## Interface and trust boundary

`createScopedClassroomService({ runTransaction })` provides:

- `snapshot(proof, expectedIndex)`: original strict snapshot contract.
- `ownSnapshot(proof)`: discovers the current index under the session lock, avoiding a client request with a guessed/stale index. Adds `total`, `startedAt`, `durationMs`, and `isDouble` to the original snapshot. `total` is null if the sealed question set cannot be verified, while independently valid receipt recovery remains available. For complete sessions this is a terminal summary: the wrapper composes the unchanged core’s authenticated own-standing check, returns `question=null` / `ownReceipt=null`, and does not index a nonexistent next question. It therefore supports `current_index == questionCount` and legacy completed rooms without a question set. The UI obtains terminal score/rank through `ownStanding`. Original strict `snapshot` semantics are unchanged.
- `submit(proof, { index, choice })`: original receipt contract, atomic answer/receipt/score persistence, changed-choice retry returns the accepted receipt.
- `ownStanding(proof)` and `hostRoster(trustedPrincipal, sessionId)`: original core contracts.
- `claim(...)`: always rejects with `claim-integration-unavailable`, before opening a transaction. Neither the synthetic test XP accumulator nor production XP tables are read or written.

Proof consists of `sessionId`, `playerId`, and a server-extracted possession secret. The wrapper constructs its own scope from copied operation arguments; there is no exported arbitrary-scope repository or caller-supplied transaction Map. Host principal must come from independently verified server authentication. This module does not implement that verifier, issuance, cookie handling, origin/CSRF checks, abuse controls, HTTP error redaction or routes. Its internal proof is not a JSON request-body trust contract.

No monotonic session revision exists in the reviewed fixture. None is fabricated. A future request wrapper must attach its verified `principalId` and appropriate identity envelope to responses; this adapter cannot infer that principal from possession proof. Client integration requires uncached/no-store responses and explicit transport interruption handling. Host advance/reset semantics still require review. The unchanged core defines the currently accepted scoring policy.

## Query and lock scope

All table references are schema-qualified, columns explicitly selected, and external values passed as SQL parameters. Every read/write is constrained by the selected session and, where appropriate, player and question. No other room's rows, global answer Maps or global XP state are loaded. Raw guest secrets never enter SQL parameters; only their SHA-256 digest does.

Consistent row-lock order is session → guest grant → player rows in ascending UUID order → requested answer. Session SHARE locks permit submissions by different players to overlap. Submit locks its player FOR NO KEY UPDATE, serializing that participant's accepted-answer/score changes without unnecessarily conflicting with foreign-key key-share locks. Read operations use SHARE locks. Host roster has no guest grant; own-standing loads only room IDs and scores. Future host/lifecycle, join, revoke and other writes must respect this same order.

Participant grant possession, revocation and expiry are checked before reading question/answer/player evidence. The unchanged core repeats ownership and expiry checks. Receipt-sidecar validation happens only when the core accesses the requested answer after authenticating possession; copied or mismatched fields fail closed. Other players' or questions' corrupt receipts cannot block this operation. Legacy evidence without provable frozen content remains keyless/historical-unavailable.

The authoritative timestamp is read with `clock_timestamp()` after all potentially blocking locks, rather than using process time or transaction-start time. SQL receipt/answer inserts and score updates run in the same transaction; a failed score write rolls all of them back. No claim state is created.

Question-set and receipt sidecars must retain the fixture's immutability protection. JSON serialization preserves the unchanged core's property-order-dependent fingerprint; changing storage to JSONB is not supported without canonicalization review. The adapter uses the proposed private sidecars and constraints from `tests/fixtures/classroom-candidate-schema.sql`; those are not asserted to exist in production.

## Transaction runner

`createSerializableRunner(pool, options)` accepts a trusted node-postgres-shaped pool but creates no connection until an operation is called. It pins one connection for BEGIN SERIALIZABLE, all queries, COMMIT/ROLLBACK and release. Search path is restricted to pg_catalog, query table names are qualified, and local lock/statement timeouts are configured.

The default is two bounded retries only for PostgreSQL serialization/deadlock abort SQLSTATEs 40001/40P01. A retry rebuilds all scoped state and resamples database time. Unknown commit/network errors, lock/statement timeouts, application errors and failed rollbacks are not retried. Unknown commit status must be reconciled through ordinary possession-verified receipt recovery by the future endpoint/client; never infer it means no answer was accepted. The operation callback must remain transactional and free of external side effects.

Pool construction, connection acquisition limits, infrastructure/TLS, role selection, minimum backend grants and dedicated-role/RLS acceptance are still release blockers. This candidate assumes a caller-owned pool with appropriate connection-acquisition bounds. Existing anon/authenticated denials are untouched. No browser role or service-role credential is configured.

## Local verification

The scoped package pins `@electric-sql/pglite` 0.3.14 with a lockfile. Install locally if necessary:

    npm run test:classroom-candidate

The test command retains the original deny-network preload. PGlite creates in-memory PostgreSQL fixtures only, with no URLs or credentials. Deterministic deadline tests explicitly substitute a SQL-returned synthetic clock in their test runner; a separate test executes actual `clock_timestamp()` and validates the accepted timestamp against database-clock bounds. Query traces verify scope, parameterization and lock order. Pool-runner tests use fake connection objects to validate transaction lifecycle/retry classification; they do not establish real network behavior.

Tests cover queued retries, scoped corruption isolation across rooms/players/questions, all accepted-value sidecar mismatches, authorization before private evidence reads, score-write rollback, NULL/deadline rejection, expiry after blocking work, scoped rank/roster, hard-disabled claim, copied request arguments and discovery/timing metadata. `test.log` records the executed run.

PGlite serializes its single connection. Queued promises are not independent-client contention, multi-process or native PostgreSQL deadlock/retry proof. Native multi-connection tests, production-role execution, schema upgrade/retention/index review, host lifecycle and the real browser regression remain required. The original 36 reviewed tests and frozen artifact are preserved separately.

## Documentation reviewed

- PostgreSQL explicit locking: https://www.postgresql.org/docs/current/explicit-locking.html
- PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html
- PGlite transaction API: https://pglite.dev/docs/api
- Supabase changelog: https://supabase.com/changelog (reviewed 2026-10-18; recent HTTP TLS change does not alter direct PostgreSQL adapter semantics).

No Supabase client API, schema migration or grant is added here. Production XP contract recovery is a separate evidence task; a verified contract alone does not authorize deploying claim integration.

Negative controls: `python3 replacement/scoped/negative-controls.py` rejects both isolated mutants (receipt-field binding removal and omitted post-lock clock sample). The candidate is never mutated; results are in `negative-controls.log`.
