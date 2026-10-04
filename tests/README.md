# Safe game test foundation

This branch adds an offline test foundation plus limited client-side classroom recovery fixes. It does not certify live classroom play. No production database, credentials, student data, browser or running app is needed for the tests.

## Commands

Use Node 20.9 or newer, matching the installed Next 16 package requirement. The checks were run on Node 24.19.0. From the repository root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run test:regressions
npm run test:all
```

Dependency installation uses the npm registry. The test commands themselves are offline and preload a network-refusal guard. They need no environment variables or `.env.local` file.

- `npm test`: offline harness, client-wrapper and synthetic-model checks. A passing result means only these checks passed.
- `npm run test:regressions`: three real assertions against current application source. **Expected to exit 1 with two passes and one remaining failure**: uncached server answer-receipt recovery has no verified existing API. These are neither skipped nor inverted into passing tests.
- `npm run test:all`: the aggregate gate. **Expected to fail today** because it includes the remaining product regression. Do not advertise an `npm test` pass as an all-green product gate.

Optional build check with a non-production placeholder target:

```sh
NEXT_TELEMETRY_DISABLED=1 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-audit-placeholder \
npm run build
```

This demonstrates compilation and prerendering, not a connected database or successful gameplay. Never replace those values with production credentials to run this audit. Do not launch `/dev/bots`, seed scripts or gameplay pages as part of these checks.

## Three distinct evidence levels

### Offline synthetic model

[`support/synthetic-classroom.mjs`](./support/synthetic-classroom.mjs) defines a small **proposed** contract: host authority, participant ownership, stable team assignments, answer receipts, deadline validation, expected-index advancement, recovery and one completion claim. Tests include a deterministic host plus 30 synthetic participants.

The two questions in [`fixtures/classroom.mjs`](./fixtures/classroom.mjs) are invented test content. They are not the live bank and are not a reviewed HSC teaching set. Actor strings and room IDs are synthetic identifiers, not credentials.

The model uses in-memory maps and synchronous operations. Its fixed 100-point scoring is intentionally simplified, not a reconstruction of the live speed-bonus economy. It proves neither Postgres isolation/locking nor RLS, authorization, RPC availability, Realtime delivery or real concurrency. A model pass is a specification example, not an implementation pass.

### Actual client source with test doubles

[`offline/live-adapter.test.mjs`](./offline/live-adapter.test.mjs) transpiles the actual `lib/live.ts`, supplies a canned `sb.rpc` double, checks outgoing parameters, and verifies that permission errors reject rather than report success. This replaces the former misleading practice of treating any RPC error as connectivity proof.

The small [`support/source-harness.mjs`](./support/source-harness.mjs) also runs actual page functions and event handlers with explicit hook, timer, storage and transport doubles. Unmocked imports and RPCs fail. Green controls verify that the actual host create handler reaches the lobby and the actual student first-answer handler reaches a receipt before reload is evaluated.

This is **not React rendering or browser E2E**. It does not exercise scheduling, hydration, HTML semantics, CSS, real timers, history, accessibility or actual sockets. Source changes that introduce new dependencies may require updating the test adapters. Unexpected harness errors must not be mistaken for reproduced product bugs.

### Actual product regressions and local fixes

[`regressions/classroom-known-bugs.test.mjs`](./regressions/classroom-known-bugs.test.mjs) keeps three concrete product assertions:

1. **Stable teams now passes locally.** The actual `assignProjectorTeams` helper preserves incumbents and assigns only newcomers. The original regression was adapted to pass the persisted prior map to the new helper; the unchanged assertion still requires every incumbent to retain its team.
2. **Active-room host recovery passes locally.** The actual create handler creates a synthetic room; the fixture then moves it to active before a remounted page offers Resume. The test invokes Resume, requires a new server-state read, and checks that active controls return. A cached code alone is not enough for this assertion. Pre-start lobby restoration remains contract-dependent, as explained below.
3. **Uncached answer-receipt recovery remains RED.** The synthetic transport knows a player answered, but this device has no acknowledged-response cache. Existing `live_rejoin` returns aggregate score and `get_live_question` returns question state; neither returns that player's answer receipt. The app must not invent one.

Do not add `todo`, `skip`, error swallowing or expected-failure inversion to hide the remaining failure. Browser and database tests must eventually supplement all three.

## Client recovery scope

The new [`live-host-controller`](../lib/live-host-controller.ts) uses only existing RPCs and player reads. It stores a successfully created room ID/code, current-user binding and projector team assignments. Successful creation preserves the original flow: the create response establishes the new lobby, and player joins do not require a pre-start question read. A failed player-list read keeps that confirmed lobby and its subscription, reports the failure, and offers **Retry players** without requiring question state. On Resume it fetches question/status and player scores before enabling controls. It never restores cached status, scores or question state. Confirmed ended state, unavailable state and failed reads are distinct and visible. Empty/null results never establish that a room was deleted and never clear the saved room. Account changes, logout, replacement rooms, disposal and stale snapshots cannot apply an older restore result.

**Pre-start lobby restoration is conditional, not a verified production fix.** The repository has no retained SQL definition for `get_live_question`. The [`lib/live.ts`](../lib/live.ts) type includes `lobby`, but its `data[0]` assertion does not prove a runtime row exists before start. The [historical test](https://github.com/kyleajames33-beep/HSCLegends/blob/1b192e23b39863b9be8b658c9af51bf7f2d1ba24/scripts/test-live-game.mjs#L28-L32) first reads that RPC after `start_game`; the [original host creation](https://github.com/kyleajames33-beep/HSCLegends/blob/1b192e23b39863b9be8b658c9af51bf7f2d1ba24/app/host/page.tsx#L50-L59) enters its lobby from `create_game` alone. Retained grant metadata gives no response-shape evidence. The lobby row in [`live-client-double.mjs`](./support/live-client-double.mjs) is an explicit fixture assumption. If a valid pre-start room returns no question row, Resume keeps the saved room with a visible unavailable/error state and disabled controls; a verified server-owned status source is needed before claiming that case works. Tests cover empty arrays, null rows and null data without destructive recovery changes.

The user binding and browser storage are **accident prevention, not authorization proof**. Cached data is editable. Server ownership and permission enforcement still require separate verification. No new grant, SQL contract or authentication mechanism is introduced.

Teams remain a projector-only grouping. They persist in that browser for one room and do not establish server-side team membership. Repeated player updates/rejoins do not reshuffle incumbents. Another projector without the cache cannot recover those private display assignments.

The student page caches only a successful `submit_answer` response, bound to room, player, question index and known user. Same-browser acknowledged-answer reloads can show that receipt. Missing/lost acknowledgements, cleared storage and cross-device recovery remain unsupported without a verified receipt-read API. Cached receipt content never awards points or changes server scores. Malformed, expired and unavailable storage is handled visibly.

Student game/account/mount generations and newest-request checks reject late state, answer and claim responses. Moving to a new question releases an obsolete answer lock so a lost previous acknowledgement cannot block play. A completed/lobby state cannot be overwritten by the previous question's late answer.

Deferred claims remain stored after a failure. Before their first attempt, a versioned local record binds the pending player ID to the initiating sign-in. Legacy bare IDs are treated as unbound compatibility records and bound before attempting. Explicit retries cannot follow an account switch; stale completions cannot clear another context's pending work or display its XP. This client binding does not repair or prove server claim ownership/idempotency.

[`offline/live-recovery.test.mjs`](./offline/live-recovery.test.mjs) exercises actual controller/helper/page source with controlled asynchronous responses, including account switching, initial auth loading, logout/unmount, newer-room replacement, duplicate updates, terminal states, stale failures, storage problems, and deferred-claim retries. These remain transport/hook-double tests, not real browser or Postgres proof.

### Async callback and guard inventory

- **Host create, restore and Start/Next:** operation epoch plus current owner guard their success, rejection and `finally` cleanup. New rooms, account changes, forgetting and disposal invalidate the old epoch. Tests resolve and reject each operation after replacement/account/unmount boundaries and assert unchanged current state and storage.
- **Created-lobby player reads and Retry players:** current epoch/owner, newest roster request and the still-created-lobby phase (`q === null`) guard both outcomes. Retry cleanup also checks the epoch. Controls cover late success/failure after Start, a new room, account change or disposal, plus initial read failure and explicit successful retry.
- **Host status snapshots:** current epoch/owner and newest snapshot version guard both outcomes. Errors are handled inside that version check. A stale completed snapshot cannot clear current recovery storage. The local auto-advance callback carries its captured room/index; a newer room/question rejects it before an RPC. This is not server-side expected-index enforcement.
- **Host presence/answer-count polls:** their existing effect-local `live` flag guards successful updates; cleanup cancels timers and invalidates callbacks. Rejections do not mutate state. Real React effect/timer scheduling is not exercised by this harness.
- **Student join/rejoin:** context epoch, owner and mounted state guard the RPC result. The subsequent initial state-read version guards error and final cleanup; cleanup cannot release a newer answer lock. Controls cover newer connections, account changes, unmount and both old outcomes.
- **Student state/final scores:** current context and newest load version guard both awaits and failures. Subscription and explicit results-retry catches repeat those guards. Stale completed reads cannot clear player recovery storage. Auth-reset and claim-effect microtasks are bound to their captured context and effect cleanup.
- **Student answers:** current context plus active question guard the visible result and receipt cache. `finally` releases only its matching answer request. Tests cover next-question/terminal/account/unmount transitions, stale success/error, and an old response settling while the next answer owns the lock.
- **Student score claims:** owner-bound claim plus context epoch guards success, error and matching storage removal. Request-object identity owns in-flight cleanup. Tests cover late success and rejection after logout, account switch, rejoin or unmount, and explicit retries that preserve failed claims.

The inventory is a client ownership check, not an assurance that the server cancels old writes. Existing mutation RPCs do not gain a new idempotency key or expected-index parameter. Same-account multiple tabs, remote replay/concurrency, lost acknowledgements, actual browser timers/transport, and missing server-owned receipt/status contracts still need separate verification.

## Production target refusal

All seven old `scripts/test-*.mjs` network gameplay entrypoints are now refusal wrappers. They refuse before reading environment credentials, loading `.env` files, importing a browser or making any request. There is no opt-in override. Missing targets, explicit production URLs and loopback URLs are all rejected.

Loopback is also refused because a local Next build or local proxy may still point at a production Supabase project. No trusted local integration environment can currently be reconstructed from this repository alone.

[`offline/entrypoint-safety.test.mjs`](./offline/entrypoint-safety.test.mjs) invokes each entrypoint in a child process with a stripped environment. It tests unset, production and loopback targets plus a fake override and synthetic key values. Refusal must occur with exit 1 and without a network attempt, secret echo or success message. New `scripts/test-*.mjs` entrypoints are automatically included.

[`support/deny-network.mjs`](./support/deny-network.mjs) additionally blocks ordinary fetch, HTTP, HTTPS, TCP, TLS and WebSocket connections. The offline suite probes all 11 patched entrypoints, including the named HTTP export, and requires synchronous refusal. This guards against accidental I/O; it is not an OS firewall or a sandbox for hostile source. Do not add networked subprocesses, native clients or live-service imports to these suites.

The original scripts remain available in Git history at base commit `1b192e23b39863b9be8b658c9af51bf7f2d1ba24`. They are historical references, **not safe commands to restore and run**:

- [Original production-targeting arena test](https://github.com/kyleajames33-beep/HSCLegends/blob/1b192e23b39863b9be8b658c9af51bf7f2d1ba24/scripts/test-arena-robustness.mjs)
- [Original live-game test](https://github.com/kyleajames33-beep/HSCLegends/blob/1b192e23b39863b9be8b658c9af51bf7f2d1ba24/scripts/test-live-game.mjs)
- [Original Gamble assertions](https://github.com/kyleajames33-beep/HSCLegends/blob/1b192e23b39863b9be8b658c9af51bf7f2d1ba24/scripts/test-gamble-vertical-slice.mjs)

## What must precede real integration tests

The repository's migrations are additive and omit the foundational questions and live-game schema. This branch deliberately does not invent a baseline and label it as production truth.

A separate, reviewed step must establish a disposable local Postgres/Supabase environment, complete schema provenance, synthetic seed data, applicable migrations, constrained test roles and a reset/cleanup contract. Tests must then verify real authorization, expiry, idempotency, row locks, simultaneous submissions, reconnect catch-up and claims. Any change to production permissions, grants, credentials, schema or deployment needs its own authorization and verification.

Further classroom acceptance should include host plus 30 students, duplicate/stale/foreign-player requests, late joins, host and student refresh, actual device/network interruptions, explanation feedback, keyboard use and mobile accessibility. This branch performs none of those live tests.

## Scope and sources

Application changes are limited to host/student recovery and their client-side helpers. Game artwork, character assets, dependencies, database migrations and production permissions are unchanged. Relevant product sources:

- [Host lifecycle and team mapping](../app/host/page.tsx)
- [Student state and rejoin handling](../app/join/page.tsx)
- [Existing RPC wrappers](../lib/live.ts)
- [Existing local recovery storage](../lib/presence.ts)
- [Product spine](../docs/PRODUCT-SPINE.md)
- [Historical robustness claims](../docs/LIVE_ROBUSTNESS.md)

Build and TypeScript success do not override the known failing product regressions or existing repository lint failures. Read every check's exit status and report the categories separately.
