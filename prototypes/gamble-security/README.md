# Gamble security lab (isolated Postgres experiment)

This is an executable contract experiment, **not a production migration or a fix for the live game**. It models one room/round with two participants using synthetic questions and balances. No application imports it, no production credentials or network services are used during tests, and it creates a fresh in-memory PostgreSQL-compatible instance each run.

```sh
cd prototypes/gamble-security
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

The exact PGlite version is pinned by `package-lock.json`; `node_modules` is ignored. Installing requires access to the npm registry. Tests use PGlite's local WebAssembly PostgreSQL engine.

For genuine two-connection transaction checks, with a local Docker daemon and the PostgreSQL 17 image already available:

```sh
docker pull postgres:17  # one-time image download; the test itself uses no network
./test-postgres-concurrency.sh
```

The script uses the local Docker socket, creates its own disposable `postgres:17` container with `--network none`, no mounts and no exposed ports, and deletes only that container on exit. Trust authentication is confined to this isolated synthetic container. It loads `schema.sql`, starts two independent `psql` sessions and observes the second session waiting on a Postgres lock through `pg_stat_activity` before the first commits or rolls back. Both schedules must end with one result and one payout. A separate injected failure on the second balance update must leave no result or payout, after which retry succeeds once. The script refuses to pull an image itself (`--pull=never`).

## Exercised contract

The lab derives a player's actor from the simulated current principal; player ID and room ID alone never authorize an action. It checks the participant's room, round, phase, deadline, answer bounds and pairing. A reconnect snapshot returns the player's own answer and choice, while excluding the question key and opponent's pending decision; only an already published result contains both decisions. Correct keys and decisions are not returned by the pre-reveal question endpoint or directly readable to the restricted test role. The first answer and first decision are retained on retries. Reveal derives the pair from server state and returns only after both decisions are locked. Overlapping or ambiguous pairings are rejected. It inserts a unique pair result and gates both balance updates on the insert's success, all in one transaction. Repeated reveal returns the same result without another payout.

`test/gamble-contract.test.mjs` exercises the actual SQL against an in-memory PGlite instance, including denial of another player's action, raw-table denial, wrong room/round/option, same-player retries, hidden decisions, ambiguous pair rejection and duplicate reveals. It injects a failure on the second balance update, after the result and first payout were written, and verifies that neither result nor payout persists; it then removes the trigger and successfully retries. It does not merely inspect SQL strings.

`client.mjs` is an isolated browser-compatible adapter for the experimental RPC shapes. It receives a transport from its caller and never manufactures a principal, only sends the acting player's identifier, validates inputs and responses, and strips unrequested server fields. Tests exercise the adapter with both mocked responses and the actual isolated SQL through an injected test transport. It is not imported into the production app, and its input checks are not an authorization boundary.

## Boundaries and release work

- **The actor source is a test double.** `lab_auth.uid()` reads a freely settable Postgres setting injected by the test harness. It is not an authentication system. Real integration must use a verified server-side `auth.uid()` bound to the request, ensure anonymous Auth is enabled if chosen, and confirm account-link and reconnect behaviour. Never grant real clients authorization based on the lab setting.
- PGlite runs its tests through one connection. The separate Docker test verifies the described concurrency schedules on a fresh local PostgreSQL 17 instance, but neither test proves behaviour against the deployed schema, isolation configuration, policies or grants. Repeat the race and forced-failure checks in a dedicated staging database after the real migration and identity boundary are implemented.
- This schema is synthetic and does not reconcile the actual deployed schema, grants, RPC signatures, realtime publications, legacy rooms or callers. It is not an eligible migration. Production integration requires a staging schema/grant inventory and the compatibility/drain plan described in `docs/KNOCKOUT_GAMBLE_SECURITY_CONTRACT.md`.
- Room/round phase transitions, pairing construction, timeout defaults, bots, question provenance, persistent XP/currency and multiple-round progression are deliberately outside this bounded experiment. Overlapping pairs are detected and rejected when used, but only trusted setup builds the sample pair; the schema does not prevent their insertion. Do not reuse this as a complete game server.
- SQL role checks here verify only the lab role's privileges. PGlite is not the Supabase API, PostgREST, JWT verifier or Realtime authorization. Verify every deployed table, view, RPC, function grant, default privilege and publication through staging, including calls from unauthenticated, guest and permanent users.
- Early answer feedback is returned only to the owning participant; this does not prevent players sharing answers out of band. The live game must make an explicit reveal-policy decision.
