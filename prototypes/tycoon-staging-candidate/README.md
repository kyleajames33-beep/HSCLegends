# Tycoon server-authority candidate — isolated staging design

**Not a production migration and not deployed.** This is an independent candidate derived from the [synthetic Tycoon lab](../tycoon-security/README.md). It has its own schema and tests and is not imported by the application. It assumes a trustworthy Supabase `auth.uid()` function and existing `anon`/`authenticated` roles. Its separate [`test/auth-fixture.sql`](test/auth-fixture.sql) creates a deliberately unsafe stand-in *only inside disposable test databases*. Never use that fixture in a real project.

The candidate requires review and compatibility work before a dedicated staging migration can be prepared. It does not remediate the deployed `credit_coins` function or alter any existing app, grants, question table, wallet or multiplayer lockdown. The live wallet finding and shared-service cutover risks are documented in [TYCOON_WALLET_SECURITY_FINDING.md](../../docs/TYCOON_WALLET_SECURITY_FINDING.md).

## Behaviour under test

- `start(release, request_key)` derives the owner exclusively from `auth.uid()`, accepts no question, key, score, recipient or amount, and uses only a published release. An idempotent repeat returns the original session; a different release using the same key is rejected.
- Trusted authors create a draft release with a subject, school year and syllabus version, insert questions, then publish it. Triggers prohibit publishing an empty release and prohibit editing, extending, moving or deleting a published release's content or metadata. Relevant release rows are locked during authoring to serialize it with publishing. New content needs a new release.
- Each 120-second session pins up to 20 selected questions and keys privately. A snapshot returns only the current question, timer, cash and level. It exposes neither question IDs nor answer keys before answering.
- `answer(session, ordinal, choice)` checks `auth.uid()` ownership, timing, question position and bounds under a session row lock. The server grades and calculates earnings. Repeated calls for a completed ordinal return the original committed receipt and cannot award again. `receipt` reads only an already answered question for the owning user.
- `buy(session, action_key, item)` accepts a choice of item, never a price or currency amount. The server owns eligibility, cost and balance and stores an idempotent purchase. The sample `funding` upgrade has a level cap of five.
- `finish(session)` takes no reward or score. The server computes a sample wallet award from checked answers and atomically writes a unique completion, ledger entry and wallet change. A retry returns the same result. One synthetic run gives at most 45 wallet points (20 correct answers × 2 + 5).
- All candidate objects are created transactionally. Direct private-schema access is revoked from `PUBLIC`, `anon` and `authenticated`; API execution is revoked from `PUBLIC` and `anon` and granted explicitly to `authenticated`. Function bodies use a fixed search path and explicit ownership checks. Existing deployed permissions and functions are unaffected.

## Local verification

With Node 20+:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

This uses pinned PGlite in an in-memory synthetic database; installation requires the npm registry, while tests need no network. Tests create the mock auth fixture, then candidate schema, roles and sample content. They cover role grants, unauthorized/future/foreign reads and mutations, no RPC overload accepting client awards, private tables, frozen releases, published selection, first-answer/upgrade/finish idempotence, upgrade and deadline bounds, result rollback, and source version pinning. These are SQL integration tests, not Supabase API or browser tests.

An additional boundary test places a synthetic wallet at PostgreSQL's integer maximum. A finish that would overflow must roll back the run status, completion and ledger together; after a trusted fixture adjustment makes room for the award, a retry credits exactly once. This verifies a local transactional failure path, not shared-wallet recovery or a production account limit.

With a local Docker daemon and `postgres:17` image already available:

```sh
docker pull postgres:17  # one-time image download; scripts refuse to pull
./test-postgres-concurrency.sh
./test-postgres-publication.sh
./test-postgres-start.sh
./test-postgres-permissions.sh
```

All four scripts create and remove their own disposable PostgreSQL container with `--network none`, no host ports and no mounts; trust authentication is confined to those containers. The first three inspect `pg_stat_activity` to confirm a second independent backend actually waits on a database lock. The first script races duplicate answers, upgrades and completions, including one transaction rollback; it checks one authoritative receipt and one mutation. The second races publication with question authoring in both orders and checks that already-published content cannot be extended. The third races duplicate starts and verifies that conflicting uses of the same request key fail rather than creating another session. The fourth checks real PostgreSQL role and schema privileges, anonymous/private-table denial and mock-UID ownership.

## Required work before a real staging or production change

1. **Verified identity:** the fixture reads a freely writable Postgres setting and proves no authentication. Real Supabase must verify the JWT and populate `auth.uid()` through its trusted request path. Validate permanent accounts, anonymous-auth settings, account linking, session expiry, pooled request state and rejoin behaviour. A public session ID does not establish ownership.
2. **Actual schema and cutover:** reconcile schema, function names, roles, privileges, function owners, transaction semantics, PostgREST exposed schemas, existing wallet ledger and shared hscscience.com.au callers. This candidate's private wallet is isolated and is not the shared ledger. Migrations, grants and old-client/service-worker compatibility require review; do not copy this file into migrations or reopen legacy credit privileges.
3. **Question-bank secrecy and content:** frozen candidate releases only protect this new private bank. The current shared question bank may reveal keys through other tables, functions or clients; those paths have not been fixed or measured here. Early feedback reveals an answered question's key to its owner, and students can share answers outside the app. The deterministic selection order is not anti-collusion. Actual released content must be educator-reviewed and mapped to a supported course, year and syllabus; example metadata is synthetic.
4. **Economy and abuse:** once-per-run claims do not prevent creating unlimited runs, automated play, bots, sharing answers or account farming. Account-wide limits, abuse controls, monitoring, reward policy and upgrades need product and security review. The sample clock runs continuously even through feedback; the current UX pauses during feedback. Pick and implement a server-owned pause/timing policy before using it.
5. **Deployment operations:** published triggers defend normal row operations, not a privileged database owner that disables triggers, alters tables or truncates them. Future function default privileges, owner roles, statement/lock timeouts, version retention and authorized publishing workflows require review. Test real transactions, errors, retries, rollback, old clients, devices and classroom load against staging, then assess rollout and rollback with shared-service owners.
