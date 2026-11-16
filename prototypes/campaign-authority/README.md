# Campaign authority lab

**Isolated local contract experiment. Not a production migration, not wired to the app, and not a deployed security fix.** The data and questions are synthetic. This schema does not modify the existing campaign or any real account, question, reward, or database.

Run `npm ci --offline --ignore-scripts` when the package is cached (or `npm ci --ignore-scripts` to install normally), then `npm test`. Tests use PGlite and an in-memory PostgreSQL instance. No production connection is required.

## What is modelled

A trusted gateway starts a run for an authenticated owner, reads its public state, submits versioned actions with request IDs, reads a recorded answer receipt, and claims a win. The SQL stores HP, energy, combo, shields, charge, question deadlines, answer keys and the fixed reward. It validates the answer and computes damage, healing and the win itself. State reads omit the key and explanation before an answer; a receipt is returned only from a recorded attempt. Each mutation locks the run row. Replaying an identical request returns its recorded result; using the ID with a different payload or version fails. A new request with an old version fails. Claims lock the run and use one ledger row per run so repeating a claim does not credit the wallet twice. Database exceptions and transaction rollback leave no partial award or receipt.

The tiny fixture uses four invented questions and a 28-HP boss to keep tests short. Its values do not represent HSC content or proposed production balance. A run with no remaining question ends `exhausted` instead of fabricating a win.

## Trust boundary — not yet solved

`p_actor` is a **trusted gateway assertion**, not an authentication credential. The lab revokes public access to the schema/functions and grants execution to a synthetic gateway role. The gateway is assumed to derive the actor from a validated session and never forward a user-selected actor. That gateway, Supabase Auth binding, RLS/grants on the actual deployed database, credential lifecycle and deployment controls are not implemented or verified here. Exposing these functions directly to clients or granting them to a browser role would let callers impersonate another actor. The actor assertion alone is not security.

PGlite exercises local PostgreSQL SQL semantics but `Promise.all` uses one in-process database client. The separate `./test-postgres-concurrency.sh` script uses a pre-existing `postgres:17` Docker image, starts a disposable container with `--network none`, and runs competing commands through **two independent PostgreSQL connections**. It observes a lock wait and checks both commit and rollback interleavings for answers, strikes and claims. This is synthetic evidence only, not proof of production concurrency, deployment behavior, isolation configuration or readiness. Tests do not prove server-side Realtime delivery, browser behavior, auth, rate limiting, production schemas, migration compatibility, balance, educator-reviewed questions or resistance to denial of service.

## Before integration

1. Inspect the complete current staging schema, grants, auth model, existing campaign rules/economy and upgrade path. Keep historical functions isolated until their callers are migrated.
2. Replace the synthetic gateway assertion with an audited server-side identity boundary and explicit ownership rules. Ensure users cannot execute privileged functions or read keys directly. Prove with anon, authenticated, other-user and expired-token tests.
3. Version and freeze reviewed question content per run; include course/year/syllabus, provenance, release status and a secure question selector. Verify the existing question bank and use real server-owned limits.
4. Reconcile stage HP, combo, shield/charge, timer rules, mastery records, cards and economy with the actual game. Define interrupted games, expiry, abandoned runs, cancellation, retries and retention. The synthetic `exhausted` outcome is only a placeholder policy.
5. Use a reviewed migration, staging database with synthetic data and explicit role/grant checks. Do not make production writes from these tests.
6. Test two independent PostgreSQL connections contending over answer/action and claim operations, transaction abort/retry and isolation; add real authenticated browser/reconnect tests. Assert no hidden answer or private receipt leaks.
7. Audit `SECURITY DEFINER` search paths, function EXECUTE grants, RLS and data API exposure. Add rate limits and observable error handling, then independently review before enabling real currency or leaderboards.
