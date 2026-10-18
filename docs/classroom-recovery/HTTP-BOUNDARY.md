# Unmounted guest issuance and HTTP boundary

The candidate now has executable server modules for guest issuance, secret-only resolution, verified account mapping and Request/Response handling. No Next.js route, connection, auth client, credential, shared limiter or browser transport is configured. The secure selector remains false.

## Modules and trusted dependencies
- guest-session.mjs: connection-pinned SERIALIZABLE transactions; sealed room questions required before joining; atomic player and hash-only guest grant; expiry bounded by configured TTL and room; unique hash resolution with locked revalidation; no alias/UUID recovery. The exported randomBytes(32) factory is runtime code only and is never invoked by these tests.
- auth-verifier.mjs: fresh request-scoped Supabase client factory, calling getUser. The SDK's explicit missing-session result preserves guest access; network/refresh/invalid-token/malformed-account results fail closed. User metadata is never authority. The factory must preserve SSR auth refresh cookies on the actual response. This wiring is not implemented by these modules.
- http-boundary.mjs: fixed configured HTTPS origin, strict operation paths/methods, Fetch Metadata and mutation Origin checks, bounded JSON bodies, cookie-only ownership and no-store responses. Shared atomic rate limiting and a server-owned source key provider are mandatory; no permissive/process-local fallback exists.

The account verifier follows the installed Supabase 2.106.2 SDK and the [official getUser documentation](https://supabase.com/docs/reference/javascript/auth-getuser). [Server-side auth guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs) distinguishes authenticated user lookup from unverified session contents and explains SSR cookie propagation. Hosted verification remains untested.

## Intended identity transitions
A null-owner guest possession survives separately verified sign-in without silently assigning ownership. An already owned participant requires the same nonanonymous verified account. Anonymous Auth identities create unowned guest participants. The separately reviewed ledger claim binds its destination account in an immutable claim marker; it does not rewrite game_players.user_id. Claim HTTP/UI integration and the full post-claim identity/retention lifecycle remain absent.

A valid same-room cookie retries join without changing alias, owner, score, expiry or secret. An invalid, expired or different-room cookie is rejected rather than silently rotated. If the original Set-Cookie never reaches the browser, a fresh join may create an orphan/duplicate participant. Exactly-once identity recovery from an alias is deliberately unavailable. Room switching requires an explicit confirmation. Revoke-session revokes the selected grant and clears the cookie only after confirmed revocation or an already-inactive result; explicit server failure responses and ownership mismatch do not clear it. A network-lost response is uncertain: the browser may already have applied Set-Cookie, so the UI must not promise the recovery cookie still exists. Separately confirmed forget-browser clears this device cookie without calling auth or the database, and makes no revocation claim. It is available even for a corrupt cookie or auth outage. There is no automatic fallback between modes. Both paths require the fixed-origin/CSRF checks, strict bounded body and shared source limiter. Neither deletes the player, score, answers or receipts. A forgotten but unrevoked secret remains valid until expiry; the UI must disclose this distinction.

## Local evidence and limits
Tests use deterministic public synthetic secrets only. Request/Response tests exercise security checks without a socket. Database integration tests compose the real HTTP boundary, account verifier, guest service, scoped service and PGlite for lobby, lost submission acknowledgement, uncached receipt restoration, committed replay, terminal standing, guest sign-in and cross-account denial. The bridge also checks committed revocation with a lost response, idempotent retry, evidence retention, new-room entry and foreign-owner rejection versus explicit device-only forgetting. PGlite remains a single queued connection, not independent native PostgreSQL contention proof. Actual synthetic-browser hydration evidence is described below.

The HTTP layer always forwards server-derived expectedOwnerId (including null) into scoped operations. The scoped transaction checks it under the selected player lock before private reads or writes, preventing a stale preflight from authorizing work after player ownership changes. This check does not invent a ledger-marker-to-player-ownership transition.

The schema-upgrade proposal remains outside the automatic migration directory. Effective role access, external inbound dependencies, ledger retention/account deletion, no direct evidence DELETE/TRUNCATE, complete rollback, native locking and actual hosted auth/cookie/rate-limit integration still require implementation and review. Production credentials/grants, deployment, gate activation and merge remain separate actions.

## Reproduce current checks

    npm run test:classroom-candidate
    python3 tests/support/classroom-auth-negative-controls.py

The final aggregate count is recorded in AUTH-BROWSER-REVIEW.md. File-level test concurrency is limited to one to bound PGlite memory usage; intentional within-test retry/concurrency cases remain unchanged. Two additional isolated negative controls detect removing the locked expected-owner guard and downgrading auth errors to guest access. Temporary mutants are removed after execution. Independent review and real synthetic-browser findings are recorded separately when complete.

## Synthetic native-browser validation

The reproducible fixture under tests/browser/classroom-fixture uses the actual secure page, recovery controller and React server rendering/hydration. Only auth and transport are deterministic synthetic adapters; external networking is blocked. Native cloud Chromium exercised lobby entry, lost acknowledgement, uncached committed receipt recovery, refresh/remount, identity changes and stale/out-of-order responses. A deliberate hydration mismatch negative control produced a recoverable error while normal hydration retained the server DOM without warnings. Browser extensions and security settings were unchanged; unrelated extension console errors were excluded from application assertions and disclosed.

This closes the synthetic component-browser check only. It does not validate hosted cookies, Supabase SSR refresh propagation, actual route mounting, production CSS, shared limiter behavior or native database contention. The selector stays false and the legacy page remains unchanged.
