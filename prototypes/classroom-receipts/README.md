# Classroom receipt contract: isolated local prototype

This is an **experimental synthetic SQLite model**, not the existing application backend, a Supabase migration, a deployable endpoint, an approved auth design, or evidence that the production regression is fixed. It contains no real users or content and is not imported by the app. The complete production classroom schema, deployed function definitions and guest-identity contract are not available in this repository.

## Observed production metadata

On 2026-11-03, a separate read-only production metadata inspection reported migration `20260922210008 sec_lockdown_unused_game_estate` among the latest migrations. The same inspection reported the following execute-access flags for the listed functions:

| Function | `authenticated` | `anon` |
| --- | --- | --- |
| `get_live_question` | true | false |
| `live_rejoin` | true | false |
| `submit_answer` | false | false |

These are observations from that inspection, not tested end-to-end gameplay, a complete inventory of function overloads or grants, or evidence of the functions' bodies, ownership checks or receipt semantics. In particular, do not infer that authentication alone is sufficient authorization, or that changing grants alone would safely restore classroom play. Function signatures, roles, effective privileges and deployed definitions must be checked against the authorized baseline before implementation. No production writes were made.

Restoring the classroom flow requires a reviewed server design that establishes host and participant authorization—including a guest identity and recovery mechanism—plus an authorized implementation, migration and verification path. The reported `submit_answer` flags are an additional blocker to investigate in staging, not a reason to grant broad execution.

The concrete model demonstrates an authorized private snapshot, a committed answer receipt, re-reading from another database connection, and one award under two concurrent submissions. Credentials are random 256-bit tokens, stored only as SHA-256 hashes in this sample; model callers supply them directly because there is no HTTP transport. Never use these sample conventions as a substitute for reviewed production identity, secure transport, device recovery, rotation/revocation and access controls.

Run with Node 24 or newer:

```sh
node --test prototypes/classroom-receipts/*.test.mjs
```

## Pieces

- `service.mjs`: a deliberately small relational schema and synchronous server model. A snapshot transaction reads the player, question and own receipt consistently; a write transaction locks before checking existing receipts, enforcing one accepted answer per room/player/question and returning the same immutable receipt on retries. A server-injected clock enforces the answer window. Raw answer keys do not appear in an unanswered question snapshot. Each player needs their own secret, and requests with missing, wrong or foreign secrets receive a generic `FORBIDDEN` error.
- `race-worker.mjs` and `service.test.mjs`: two actual SQLite connections race different answers against the same question. The tests assert one identical receipt and one score award, privacy against another participant, deadline and bounds handling, and a fresh connection read.
- `recovery.mjs` and `recovery.test.mjs`: a deliberately separate client adapter validates snapshot and receipt identity and ignores late/superseded connection reads. It is not wired to the real UI and cannot authenticate the server by itself.

The minimal fixture includes exactly one active question and a fixed 100-point score. Its privileged `createFixture`/`addFixturePlayer` helpers are test setup, not endpoints. It does not implement host authorization, join/rejoin, teams, pause, complete-game state, real clocks, credentials across devices, explanation revision, durable award ledger, claims, retention or the complete proposed JSON contract. It uses SQLite locking, not Postgres transactions, RLS, JWTs, Supabase Realtime or browser scheduling. These tests demonstrate model behavior only and do not establish deployed authorization or classroom readiness.

## Path to the real app

1. Obtain an authorized schema-only baseline and disposable Postgres/Supabase staging environment. Confirm owner/guest identity, deployed function signatures and their grants before designing compatibility or migration steps.
2. Review and choose a server-owned participant identity and recovery lifecycle. Room codes, names, player IDs and browser storage are selectors, not authorization.
3. Implement an owner-bound snapshot/submit contract against the approved schema and scoring policy. Use explicit grants, server-side deadlines, an atomic transaction and unique per-question accepted-answer identity. Plan migrations and rollback separately. Use the reviewed requirements in `docs/proposals/CLASSROOM-SERVER-CONTRACT.md` as the fuller target.
4. Run actual Postgres authorization, concurrent submission, idempotency and disconnect/rejoin tests against synthetic records, then exercise the real app with browsers and devices.
5. Only after the server contract exists and is authorized, adapt `lib/live.ts` and `app/join/page.tsx` to consume the owner-bound snapshot. Preserve the existing red `tests/regressions/classroom-known-bugs.test.mjs` assertion until it passes against the actual implemented path. Do not infer receipt content from score or pretend this prototype makes that regression green.
