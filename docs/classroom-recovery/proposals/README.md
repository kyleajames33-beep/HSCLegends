# Classroom-only upgrade proposal, disabled and nondeployable

This directory is outside supabase/migrations and is never automatically applied. The SQL is a review proposal, not a deployment instruction. PR7's secure gate remains false; no runtime file changes are part of this update.

## Verified structure and proposed delta
The owner-approved structure-only catalog query captured columns, constraints, indexes and noninternal triggers for public.game_sessions, game_players and game_answers on 2026-10-18. No application records were read. The saved JSON contains structure only; the local baseline uses a synthetic auth.users identity stub and does not export live policies/grants or external dependencies.

Existing room→player and room/player→answer foreign keys have ON DELETE CASCADE; no noninternal triggers were present. The proposal adds UNIQUE(player id, session id), validates the composite answer binding, and adds private question snapshots, hash-only guest sessions and accepted receipts. Secret hashes are unique for a future cookie-only lookup. Historical mismatches abort the whole upgrade without silently repairing records.

Snapshot/receipt UPDATE is rejected. DELETE deliberately follows the existing cleanup cascade. The future backend principal must have no direct DELETE or TRUNCATE permission on evidence; this proposal creates no such principal or grants. Private tables have RLS enabled and no PUBLIC/anon/authenticated privileges. No immutable snapshots are invented for active or historical legacy questions.

## Reproduce local evidence
From repository root:

    node --import ./tests/support/deny-network.mjs --test tests/database/classroom-upgrade.test.mjs
    python3 tests/support/classroom-upgrade-negative-controls.py
    npm run test:classroom-candidate

The normal candidate command discovers the six upgrade tests. Negative controls temporarily create tests next to the original and remove them afterward; expected assertion failures demonstrate sensitivity. PGlite is a single-connection synthetic database, not real independent transaction contention or production-role proof.

## Remaining gates
- Full inbound dependencies, private-schema name availability, exact migration-chain baseline and existing data validity. The approved catalog query covers only the named three tables' own structure.
- Effective least-privilege role, RLS and inherited/default grants. No credentials or backend access are configured. Direct SQL adapters cannot simply run under an EXECUTE-only function role.
- Ledger claim/event retention and account/room deletion semantics. Ledger tables and grants are intentionally excluded here. Unsafe legacy claim access must be retired before replacement exactly-once guarantees apply.
- Reviewed retention and rollback plan. Transaction failure rolls back an unsuccessful upgrade; that is not an approved post-deployment rollback. Dropping evidence after accepted answers or claims could destroy recovery/idempotency guarantees, so no destructive down migration is supplied.
- Native PostgreSQL independent-connection lock/expiry/retry and uncertain-commit tests, actual constrained-role tests and a complete approved nonproduction schema-upgrade rehearsal.
- Real guest issuance, cookie-only resolution, verified nonanonymous account identity, origin/CSRF/abuse protection, compatible host lifecycle and claim UI integration.
- Actual browser SSR/hydration and interrupted recovery flows. Local Chromium could not launch due to a socket restriction; the hosted preview requires Vercel login. Neither was counted as passing browser QA.

The previous core/scoped/ledger/client tests remain useful, but their synthetic fixture includes a DELETE-blocking evidence trigger. This proposal deliberately changes that lifecycle behavior to preserve verified classroom cleanup. The ledger adapter is not claimed to run on this classroom-only schema.

## Deployment approval sequence
Complete the above implementation and review, generate the actual migration through the supported CLI workflow, then obtain target-specific approval for nonproduction application, credential/role changes, exact production migration/legacy retirement, deployment/gate enablement and merge. No production schema/security action is authorized by this proposal.
