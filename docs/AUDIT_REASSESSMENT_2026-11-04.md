# Classroom-core audit reassessment

The external audit was supplied on 4 November 2026. It is useful input, not independent proof of live service behavior: it relied partly on this repository's earlier point-in-time metadata notes. The product direction is now to finish a trustworthy classroom game, one solo arcade game and study tools before expanding modes or art. Existing routes and saved progress remain in place; secondary connected modes have been moved behind a disclosure in the hub rather than deleted.

## Agreed priorities

1. **Classroom first.** Establish a dedicated disposable staging environment, verified teacher and guest identity, private versioned answer keys, transactional grading, a durable actor-bound answer receipt, recovery and real multi-device host/student tests. The existing isolated v2 SQL and client are candidates; neither is deployed or connected to the live classroom. Preserve the failing uncached-receipt regression until the real app has an authoritative receipt.
2. **Reward integrity before release.** The shared `credit_coins` issue and client-reported rewards are real findings from the separate read-only metadata/function audit. Replace affected paths with server-owned, idempotent outcomes and test all shared HSC Science consumers before any reviewed cutover. UI confirmation checks do not close the server issue.
3. **Content workflow.** Teachers can validate CSV/JSON, inspect answers and provenance, download a locally processed unreviewed draft and preview it against simulated rivals at `/question-import`. It does not upload, provision staging, verify scientific correctness or host a classroom game. The REST seeder defaults to a dry run and requires an explicit target and apply flag; the known shared production target has an additional explicit guard. An isolated classroom candidate can store and return draft explanation and provenance to its owning host in synthetic tests; a reviewed staging import with stable versions and durable records is still required. Image/diagram support remains open.
4. **Narrow execution.** Keep Lab Rush as the solo arcade focus and improve classroom/study reliability. Existing Knockout Solo is retained as an explicitly simulated practice sample, not the classroom implementation; avoid starting more parallel modes. Do not remove legacy routes or saved progress while their consumers are unknown.
5. **Verification.** Validate guests, roles, privacy, concurrent answer/advance/claim, reconnection and two-device flows against real authenticated staging, then run a classroom pilot with reviewed content. Local doubles and containers alone cannot establish these claims.

## Corrections and scope

- Lab Rush has optional synthesized sound effects. The broader platform does not yet have a coherent audio system.
- Some legacy classroom SQL is retained (for example `join_game` and rejoin in `20260705_arena_robustness.sql`), but a complete, verified schema/function baseline corresponding to the deployed classroom is not present. A retained function is not evidence that the deployed path is safe or callable.
- Server-side scoring is not sufficient evidence of trustworthy scoring: the observed classroom grants block submission and the broader reward endpoints accept client-controlled values. The candidate tests use synthetic actors; they do not verify real JWTs or Supabase Realtime.
- Catalog privileges show authenticated access to certain create/join functions, but not an end-to-end successful teacher or student flow. Claims that all listed connected modes work require current staging evidence.
- Historical question totals are not reviewed HSC coverage. Automated checks and explanations do not establish correctness, copyright permission or syllabus mapping.
- The working tree contains a large mixed batch of pre-existing and newly made changes. Preserve them; any later commits should be intentionally reviewed and split without assuming every existing modification belongs to this audit.

The previous visual-direction and playtest proposals remain useful after the user-requested functionality pass, but no further visual redesign is required for the above work.
