# Local classroom XP-ledger candidate

Unconnected review candidate, 2026-10-18. This implements a separate claim service using the verified XP ledger shape, without enabling the existing scoped adapter's claim method or the frontend. No hosted database, user records, real credentials, grant, migration, upload or deployment is involved.

## Verified contract and deliberate adaptations

The source contract is `XP-CONTRACT.md` in the enclosing investigation directory, recovered through read-only catalog/function inspection. The legacy `claim_game_xp` RPC is never invoked.

- Award is exactly `max(player.score, 0)`; no caps or bonus rules are invented.
- The event uses `reason_key = live_game:<player UUID>`, amount = award, kind = xp.
- Subject is retained only for biology, chemistry, physics, maths, science, maths-standard, maths-advanced, maths-ext1; otherwise NULL.
- New awards insert/increment `user_stats.total_xp`, updating updated_at while preserving existing coins.
- The verified XP tables have no non-internal triggers. Fixture failure-injection triggers are installed only within individual tests.

`createLedgerClaimService({runTransaction}).claim(proof, trustedPrincipal)` returns `{schemaVersion:1, playerId, userId, awarded, totalXp, disposition}`. `awarded` is an integer. `totalXp` is a canonical nonnegative decimal STRING, bounded to PostgreSQL bigint maximum 9223372036854775807. This is an intentional safe wire adaptation of legacy `total_xp bigint`; it never silently converts account totals to JavaScript Number. SQL casts bigint to text, then the adapter validates it before returning. `disposition` is awarded, reconciled or replayed.

A replay returns the original award and currently authoritative account total. Other legitimate XP may have changed that total since the initial claim; disposition and total are not promised to equal the original response. The event/claim and award remain exactly once.

## Ownership and immutable claim

The trusted request boundary must independently verify a non-anonymous account principal and extract the possession proof from its secure server-side session/cookie path. A JSON body principal, alias, known player UUID or existing event is not ownership evidence. This module does not implement that boundary.

The adapter reuses the unchanged reviewed core's possession, expiry, revocation, completion, owner-compatibility and award policy. Its temporary policy Maps are discarded; the core's synthetic XP accumulator is never used as account state or persisted. All actual ledger/aggregate operations use the verified tables.

An immutable, globally player-unique proposed claim binds the player, room, destination, event ID, amount, reason, kind and subject. The legacy player's `user_id` is not used as an already-claimed flag and is never changed. A signed-in owner can therefore make their first genuine claim; an existing owner cannot transfer it to another account. A guest claim is permanently destination-bound by the new claim marker.

## Legacy reconciliation policy

All events for this ONE player's reason are inspected across destinations because the legacy unique key covers `(user_id,reason_key)`, not the player globally.

- No event/marker: create one exact event, one global marker and one aggregate addition atomically.
- One exact matching event, no marker: require matching destination, amount, kind and normalized subject, plus an existing safe aggregate at least as large as this award. Insert a reconciled marker only. Do not increment or rewrite the aggregate/event.
- Existing matching marker: require its entire recorded binding and exact matching event, plus safe existing aggregate. Return replayed without a write.
- Another destination, multiple same-reason destinations, inconsistent amount/kind/subject, mismatched marker/event, absent aggregate or unsafe total: fail closed. Do not move an event between users, recreate missing totals, fix malformed history, or award again.

Aggregate presence and a lower bound are safety checks, NOT independent proof that historical user_stats matches the complete economy. The inspected partial ledger cannot establish all historical accruals, reductions or omitted events. Reconciliation therefore acknowledges a matching existing event without claiming a full account audit. Manual review remains necessary for any discrepancy.

## Transactions and concurrency

Use a connection-pinned SERIALIZABLE transaction runner such as `lib/classroom-server/serializable-runner.mjs`. All supplied values are parameters. Reads are room/player/account scoped, except the deliberately player-reason-scoped event query across destinations.

Lock order extends the reviewed scoped adapter: room → guest grant → player → global claim → same-reason events ordered by user/id → destination profile → destination aggregate. New claims serialize on the player; different players awarding to one account serialize on the account row and use an atomic SQL increment. The runner must retry full transactions on explicit serialization/deadlock aborts, never blindly on uncertain commits.

Possession expiry is checked again with database wall-clock time after all potentially contended locks. Event, marker and aggregate writes commit together. Stats write failure rolls back the earlier event and marker; marker failure rolls back the earlier event. The aggregate result is checked against the expected exact bigint sum before commit. On an uncertain commit the future endpoint must recover through a fresh authenticated replay, not assume failure means nothing committed.

## Fixture and verification boundaries

`fixture-ledger-schema.sql` extends the original isolated fixture. XP table columns, constraints and foreign-key targets follow the verified contract. `user_profiles(user_id)` is an explicitly minimal test identity stub, not a profile-schema export, real person record or approved production migration. The room subject column is a test projection of the verified function input. The new private claim table and reason lookup index are proposed structures. RLS/role denials are local containment; no access grants are added.

Run:

    npm run test:classroom-candidate

The package/lockfile pins PGlite 0.3.14. Tests create only in-memory fixtures with the deny-network preload. Deterministic expiry tests explicitly substitute a SQL-returned fixture clock. PGlite's single connection queues promises; queued retries and same-account awards do not prove multi-client PostgreSQL contention, deadlock behavior or process/network failure recovery. `test.log` records executed results.

## Still required before release

- Independent review and native PostgreSQL multi-connection/role tests for both scoped and ledger services.
- Complete user_profiles/dependency, retention/cascade, index and upgrade-migration review with existing rows.
- Reviewed least-privilege backend role and endpoint authentication/cookie/CSRF/rate-limit boundaries.
- Disable or otherwise retire unsafe legacy claim access during rollout. The old RPC does not honor the new marker, so co-running it can invalidate exactly-once guarantees even though this replacement is internally idempotent. No such production change is made here.
- Host completion/lifecycle immutability and allowed writers must preserve the lock order and frozen final score/subject.
- Manual reconciliation for mismatched history and explicit authorization for production changes.

The scoped service and client claim button remain disabled. This candidate alone does not enable accounts, grant access or fix the live classroom flow.
