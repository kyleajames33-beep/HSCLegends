# Classroom follow-on reconciliation

Date: 2026-10-05. **Local review candidate; no publication or deployment.**

## Base and resolution

Fresh public Git reads verified main at `a75b2565455e9ed7857d077ec0d3e89407e252c0`, tree `734e274650dddc27472d23d8a1dcb08896f5bef4`. The reviewed programme base `5f7979b` has an identical tracked tree to original PR #2 commit `863b007`. Its four follow-on commits were applied with Git's three-way cherry-pick onto merged main, rather than copying old page files over main.

The one source conflict was in the student state-read handler. Resolution preserves both sides:

- The merged `10d4256` unavailable/rejected-read path releases a stale connection busy state only when no answer is in flight.
- The reviewed programme binds reads and retained callbacks to the originating owner, room, player and connection generation. Newest read versions still own settlement.
- The host controller's subscribe-before-initial-roster-read fix and both newly merged race test files remain byte-identical to main.

The reviewed standalone prototype is copied without changes from `cf00afaab2537ecdfe8cdca6f61d0f709c3cebd8`; all 15 paths remain confined to `prototypes/lab-tycoon/`. It has no production route, network client, account, database integration, dependency or production scoring effect.

## Recommended review scope

One bounded follow-on PR can contain the already reviewed source-identity/importer checks, local classroom jobs 11–15 and the clearly labelled isolated item-16 concept. The concept's presence does not satisfy the reliable-core prerequisite for integrating a game mode. The changes to the main application remain confined to host/student displays and existing client helpers; no migration, grant, RPC signature, dependency, game asset, production configuration or other application route is changed.

The source importer recovers declared letter keys and blocks unsupported course identities. It does not choose curriculum mappings, seed a database, add a new course or certify content. The 84-bank audit is pinned historical evidence with five sampled review files, not current/full review-bank coverage.

## Verification against frozen main

- Main: **98/98 offline tests passed**. Candidate: **133/133 offline tests passed**.
- Every one of main's eight offline/regression test files is byte-identical in the candidate; no assertion, skip or failure inversion was introduced. The source harness adds explicit adapters for the new helpers/controls, rather than suppressing unknown imports.
- Both: **2/3 product regressions pass; uncached answer-receipt recovery fails**. `npm run test:all` intentionally exits 1. A missing server-owned receipt is never invented from scores or converted into a green check.
- Standalone prototype: **52/52 tests passed**, generated HTML reproduced its reviewed bytes and all eight published source/bundle checksums matched.
- TypeScript and focused changed-application-file lint: **pass**.
- Full repository ESLint: **fails with the same 34 errors and 16 warnings** on frozen main and candidate. Normalized file, rule, location and message multisets are identical; there are no added or removed issues.
- Both frozen main and candidate production builds with loopback Supabase URL and a non-secret placeholder key: **pass, 42 pages generated each**. An initial build attempt rejected the external dependency-directory symlink; copying the same installed dependencies into the candidate fixed that environment-only issue without changing configuration or source. Build/prerender success is not connected gameplay proof.

`git diff --check` reports six inherited trailing-whitespace lines in the unchanged prototype's historical `verification/v1-negative-controls.txt` transcript. The prototype is kept byte-for-byte reviewed rather than editing historical evidence; no application/source whitespace warning is present.

Five independent negative controls ran against separate copies of the actual candidate. Each deliberately removed one safety property and failed a semantic assertion in real page-handler/controller tests, rather than failing from a missing file/import or syntax error:

1. Remove newest student read-failure busy cleanup: join/rejoin retry buttons remain disabled.
2. Delay the host subscription until after the initial roster read: a player joining during that read is lost from the visible lobby.
3. Couple Refresh to answer busy state: a pending answer blocks the catch-up read.
4. Allow retained callbacks to adopt the current generation/room: an obsolete answer reaches `submit_answer`.
5. Remove the active-question guard before answer submission: an unanswered previous-question callback submits after catch-up.

These tests use explicit hook/transport/timer doubles. They do not prove browser scheduling, visual/keyboard accessibility, real concurrent devices, sockets, authorization, backend idempotency or transactional safety.

## Follow-on independent source review (2026-10-05)

Independent source-integration review of the frozen follow-on passed, including preservation of the newly merged race fixes, the unchanged prototype files and their offline tests. The prototype README and `verification/STATUS.md` at `cf00afa` are historical snapshots: their references to pending V2 re-review describe the earlier prototype freeze, not the current review status. Later independent source review passed; those original files and their six historical-log whitespace lines remain unchanged for provenance.

The question-source fixture assertion is labelled narrowly: 18 pinned raw records preserve their source-declared keys. That fixture does not represent every observed bank shape; the legacy object-options/letter-answer path has synthetic test coverage and separate pinned-census evidence. Source review and these checks do not replace browser, educator/science acceptance, backend readiness or production-integration gates, which remain open.

## Limits that remain open

Uncached/cross-device receipt recovery, authoritative pre-start status, backend ownership/grants/deadlines, real pause/reading/scoring accommodations, verified explanations and complete misconception reporting remain unverified or unavailable. No production data, gameplay, raw function source, secrets, migrations, grants or RPC changes were used in this reconciliation. Prior backend inspection limitations were respected; this work did not retry that inspection or access it through another route.

Importer release blockers remain: 3,919 bank rows with unresolved/unsupported identities, 430 source extension-tier declarations missing from the seed contract, and 246 Maths Module 7–8 rows without selector coverage. No blocked rows were silently mapped or seeded.

The prototype still needs actual browser/educator acceptance and production integration remains held behind dependable core. Independent review must assess this exact incremental diff before any GitHub publication; publication itself does not authorize merge or deployment.
