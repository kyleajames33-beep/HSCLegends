# Guest HTTP/auth and browser review — 18 October 2026

## Scope
This batch adds an unmounted guest issuer/resolver/revoker, Request/Response boundary,
Supabase getUser account mapper, locked ownership revalidation and explicit client
leave/switch confirmation. It includes a reproducible real React SSR/hydration fixture.
No route, live transport, credential, role, grant, migration or feature flag is enabled.
The source gate remains false and the legacy page remains byte-identical.

## Reproduced checks
- Independent full candidate suite: 183/183 pass; final serialized rerun: 183/183 pass.
- Isolated changed-source TypeScript check: pass.
- Unchanged original recovery controls: 27/27 pass.
- Original legacy regression: 2 pass, 1 known missing-receipt failure, unchanged.
- Two isolated negative controls detect removing locked ownership checks and treating
  auth failures as anonymous guest access.
- Guest leave service: 24/24 pass, including ownership, inactive/expired grants,
  final-lock time checks, immutable principal capture and SQL revocation rollback.
- Real HTTP → guest/scoped PGlite bridge: 7/7 pass, including lost answer/revocation
  acknowledgements, idempotent retry, retained evidence and subsequent room entry.
- Independent probes additionally checked hung-body cancellation and guarded ranking
  without peer-lock inversion, with final expiry checks after blocking work.

The candidate npm command serializes test files to bound PGlite memory use. One earlier
parallel aggregate had three database test-file process failures without assertion
output while concurrent review was running; memory pressure is suspected, not proven.
Intentional concurrency within individual tests is unchanged. PGlite's single queued
connection still does not prove native multi-connection lock behavior.

## Browser scope
The existing native cloud Chromium rendered the real secure page with React19.2.4
server markup and hydrateRoot. The fixture replaces only auth and transport with
synthetic implementations. It blocks external network traffic and uses diagnostic
CSS rather than the production style/font pipeline.

Normal hydration retained server DOM nodes with no page recovery/warning/error events.
A deliberate mismatch control caused the expected recoverable hydration error. Clicked
flows covered lobby join, lost acknowledgement, unscored practice, committed receipt
recovery after refresh/remount, final standing, identity changes, stale and out-of-order
responses, missing historical keys and incorrect ownership binding. Unrelated installed
extension console errors were disclosed; no browser settings/extensions were changed.

Final rebuilt-source leave clicks also passed: confirmation cancellation made no leave call and retained the result; confirmed revocation returned to join and allowed another room; lost acknowledgement locked stale questions and retry caused no second revocation; rejected revocation did not silently forget; separately confirmed forgetting made zero revocations and worked before binding. Normal hydration retained server nodes with no page/hydration errors.

See tests/browser/classroom-fixture/README.md for reproduction and click steps. Generated
bundles, screenshots, raw logs and workspace-specific paths are excluded from the PR.

## Remaining release requirements
- Mount the reviewed boundary with request-scoped Supabase SSR clients and correctly
  propagate refreshed auth cookies. Validate real hosted account/cookie transitions.
- Implement a real shared atomic limiter and trusted proxy/source-key contract.
- Resolve cross-tab/remount cookie response ordering. Same-controller pending join/leave
  fencing is tested, but epochs cannot prevent a delayed Set-Cookie from another context.
- Review additional bounded schema metadata before least-privilege role/RLS/inherited
  grants, inbound dependencies and ledger retention/deletion design can be finalized.
- Complete host lifecycle, sealed-question presentation and frontend XP claim integration.
  Retire unsafe legacy claim access before replacement exactly-once guarantees apply.
- Test native PostgreSQL independent connections, constrained-role behavior, uncertain
  commits and a complete approved nonproduction migration/rollback rehearsal.
- Full repository build/lint/typecheck and hosted browser checks remain separate from
  partial-source typecheck and synthetic fixtures. Preview success alone is not activation.

Production migration/security/credential changes, activation and merge require separate
approval after these gates are completed. Existing automatic preview billing is unverified.
