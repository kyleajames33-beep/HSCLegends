# Server-authoritative Tycoon lab

**Synthetic experiment only.** This prototype is isolated from the app, deployed database and shared wallet. `schema.sql` is not a migration. No application imports this code, and its synthetic users/questions/currency have no production meaning.

## Run

From this directory with Node 20+:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

The local PGlite dependency is pinned in this prototype's lockfile and `node_modules` is ignored. Installation needs the npm registry; the tests execute offline in an in-memory PostgreSQL-compatible engine.

For real two-connection PostgreSQL checks, first make PostgreSQL 17 available to the local Docker daemon:

```sh
docker pull postgres:17  # one-time image download; not performed by the test
./test-postgres-concurrency.sh
```

The test creates an ephemeral container with `--network none`, no host ports and no mounts, loads only synthetic data, and deletes only its own container on exit. It uses trust auth solely inside that network-isolated container. Two separate `psql` sessions race answer, purchase and completion; `pg_stat_activity` must show the second waiting on a database lock. Four schedules cover answer commit, upgrade commit, completion commit and completion rollback. They require one accepted answer, one purchase, or one completion/ledger award as applicable.

## Proposed playable rules

The trusted bank has reviewed-style sample rows. A run is started with an owner, subject and an idempotency key; the server pins up to 20 questions and their answer keys into private session state for 120 seconds. The snapshot shows only the current stem and options, server deadline and the player's cash/level—not future questions or keys. A correct answer earns `5 + 5 × funding level` research cash; a wrong answer earns zero. Each answer advances once. The first answer receipt, including key and explanation revealed after that attempt, is returned for repeated submissions of that ordinal. A separate owner-authorized receipt endpoint retrieves an already committed answer without resubmitting.

The lab has one bounded `funding` upgrade, max level 5, costing `10 × 2^current_level` research cash. A purchase has a client-generated action key, but the server owns price, eligibility, balance and effect. The same key returns its original receipt; reusing it for another item is rejected. Finishing gives 0 wallet points if no correct answers, otherwise `2 × correct + 5`; a unique completion and ledger entry gate one wallet increment. These are proposed illustrative rules, not HSC-validated content, game balance or the full app economy. Cash is local to the run; wallet points are synthetic.

PGlite tests cover actor ownership, private bank denial, future-key secrecy, answer bounds, past/future replay, idempotent starts/answers/purchases/finish, source-bank changes after a run starts, insufficient funds and level cap, expiration, and injected wallet failure after completion/ledger insertion. They assert that rollback leaves no completion, ledger entry or balance, and a retry credits once. The Docker tests cover actual simultaneous requests and rollback/commit ordering on PostgreSQL 17.

## Security and integration limits

- **No real authentication:** the test-only `lab_auth.uid()` reads a freely changeable custom Postgres setting. It is not a credential. Real integration requires verified `auth.uid()`, role/grant review, guest session retention and request-level identity binding. A player or room identifier never proves ownership.
- The prototype's `SECURITY DEFINER` functions, role grants and search paths need independent review against the actual deployed environment. It does not establish Supabase Data API, Realtime, JWT validation or browser behaviour. No authority claim extends to the current app.
- Actual content needs reviewed course/syllabus/version identity and HSC QA. This lab's tiny question set is synthetic, and its pinned snapshot does not settle curriculum migration or data provenance. The standalone API does not implement question randomization or current-bank selection in production.
- A single run's idempotency does not prevent repeat-run farming, multiple accounts, bot abuse, hostile device time, or unbounded account-wide rewards. The proposed policy needs product review, server rate limits, per-user/season reward limits, telemetry and anti-abuse design. It also needs server clock semantics matched to the chosen feedback/pause UX; this example's clock runs continuously after start.
- The receipt endpoint is not yet integrated with a UI or verified Supabase transport. Account linking, question exhaustion, abandoned sessions, retention and cleanup, transaction timeouts and error recovery remain to be designed.
- The Docker tests prove the listed interleavings against the synthetic schema on one PostgreSQL version; they do not validate the deployed schema, production grants, pooled JWT state, concurrent bank edits or every interleaving. Repeat all tests using distinct real auth identities against a dedicated staging environment after compatibility review.
- The existing shared project's `credit_coins` finding and migration dependencies are documented in [`docs/TYCOON_WALLET_SECURITY_FINDING.md`](../../docs/TYCOON_WALLET_SECURITY_FINDING.md). Do not expose the existing arbitrary-credit function or re-enable locked multiplayer functions to make the prototype work.
