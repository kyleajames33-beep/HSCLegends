# HSCLegends classroom recovery: proposed draft PR

## Concrete status
Review branch scope based on main at 5283ac7a12d1e011398ee1d1f62b71fa4056251a. Target review branch: fix/classroom-owned-recovery. This document records checks before publication; refer to the draft PR for current branch/check status.

The overlay has conventional runtime files in lib/classroom-server, a gated /join UI, database/offline tests, and a test:classroom-candidate npm script. OVERLAY-MANIFEST.json lists every intended changed file; other local files are unchanged dependencies for validation and must not be uploaded as changes.

## What this PR would accomplish
- Preserve existing /join by default via byte-identical legacy-join.tsx and a false source gate.
- Add tested guest-preserving UI that recovers owned server receipts, isolates stale responses and handles unavailable historical content honestly.
- Add bounded SQL adapters, SERIALIZABLE transaction handling, private receipt provenance and scoped host/participant reads.
- Add a separately tested XP ledger service preserving award/reason/subject semantics, exactly-once destination binding, safe legacy reconciliation and bigint-string totals.
- Add offline and PGlite tests; no hosted endpoint, migration or role/grant is enabled.

## What it would not fix live yet
The new UI transport is disconnected and gate remains false. Guest-session issuance, trusted hosted auth, cookie/CSRF/origin/rate limits, least-privilege backend role, actual schema migration and real host lifecycle are not implemented/enabled. The original legacy missing-receipt regression remains red. This must be described as a staged integration candidate, not a live classroom fix.

Native PostgreSQL multi-connection contention/role tests, full repository build/lint/typecheck/browser QA and independent review of final relocated sources are release gates. Partial source typecheck and synthetic tests are not substitutes.

XP rollout must retire/block the unsafe legacy claim RPC before replacement exactly-once guarantees apply. No production access or security change has been made. Historical aggregate presence/lower-bound checks do not constitute a complete account audit.

## Local checks executed
- Restored original reviewed core+fixture suite: 36/36 pass.
- Relocated candidate suite: 93/93 pass (26 policy, 21 scoped/runner, 18 ledger, 28 secure-client/gate/bridge).
- Existing unchanged recovery controls through default gate: 27/27 pass.
- Isolated changed-source TypeScript5.9.3 check: pass.
- Original regressions through default gate: 2 pass, 1 expected missing-receipt failure.
- Scoped negative controls: 2/2 rejected, with independent reviewer extra probes passing.
Independent review cleared scoped, client and ledger candidates, including additional rollback, terminal expiry and real database-clock probes. Relocation was separately tested locally; a full repository build/browser review remains outstanding.

## Upload/check cost approval needed
No hosted CI or deployment was triggered. GitHub reads found no .github/workflows directory or vercel.json at the pinned base. This does not rule out connected third-party checks: existing PR4 demonstrates automatic Vercel preview deployments, and review integration can run when a draft is marked ready. Account billing/credits were not inspected, so upload/PR cost cannot be stated as zero.

Repository integration and the ordinary existing preview integration were approved for this draft-PR scope. Do not mark ready, merge, change grants, create credentials, run a migration or deploy the secure backend under upload-only approval.
