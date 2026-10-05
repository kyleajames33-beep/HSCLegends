# Question-source coverage and curriculum-identity contract

Original audit: 2026-10-04, against [PR #2](https://github.com/kyleajames33-beep/HSCLegends/pull/2) at `863b007d5d9ad7412292fc31fef23df8693f2b28`. This source-coverage change is now reconciled unchanged onto merged main `a75b2565455e9ed7857d077ec0d3e89407e252c0`; see [the reconciliation checks](./FOLLOW-ON-RECONCILIATION.md). The inventory below remains pinned historical evidence, not a fresh source census. No GitHub write, database read/write, schema/RPC/grant/auth change, deployment or connected gameplay test was performed by this follow-on.

## Scope and source evidence

The PR head was rechecked live, and all 284 remote tracked blobs matched the isolated local baseline before editing. Teaching-APP remains pinned to `99d107b14e525ef538448bf9260af2b51e453865`, the previous audit's source revision. This is deliberately **not a claim about current Teaching-APP HEAD**.

A nontruncated Git tree inventory contains 99 `question-bank-data.js` files under `subjects`, of which 84 are in Year 11/12 paths. All 84 senior bank files were fetched and verified against their Git blob hashes. They publish 10,953 runtime question rows. Six curriculum maps, the review manifest, quiz schedule, three source-consumer/invariant files and five representative review files bring the byte-verified evidence set to 100 files. Only five review files were read: their 25 rows are **not full review-bank coverage**. Root-level question stores and junior banks are not part of this ingestion inventory.

The review handoff contains the complete source ledger, exact hashes, per-file shape/count report, old/new importer outputs, safe test logs, and eight mutation logs. Runtime output counts do not count 460 legacy entries that the source itself excludes.

## Findings and local changes

1. **Course contamination:** the old prefix classifier labeled six Extension 2 banks as Maths Advanced, emitting 1,061 questions under the wrong course. The classifier now matches an entire course directory. Extension 2 is an explicit unsupported-course failure, with its questions and source identity retained in the audit, not imported as Advanced. Four Health and Movement Science banks (840 runtime rows) also become visible senior-course blockers instead of harmless outside-scope skips. No new course is added to Legends.
2. **Valid answer-format omission:** 152 Physics Module 6 rows use `stem`, an A/B/C/D option object and letter `answer`; 31 named-unit Maths Standard rows use array options and letter `correct`. The pinned [source adapter](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/question-bank.js#L60-L174) explicitly supports these forms. The importer now preserves those declared answers, with bounds, duplicate-label and conflicting-key checks. Physics regains 152 emitted candidates. The 31 maths rows remain blocked on curriculum identity; accepting their answer format does not authorize a module mapping.
3. **Metadata:** all 212 raw `dotPoint` and 104 raw `dotpoint` fields survive in audit diagnostics under their original names. They are not relabeled `syllabusPoint`. The 430 source `syllabusTier: extension` declarations and raw difficulty/Bloom values remain in audit metadata. No media or `syllabusPoint` fields occur in these 84 runtime banks; media preservation/quarantine remains synthetic-test evidence.
4. **Source authority:** the full pinned Extension 1 Module 9 fixture still emits exactly 40 and records 120 omissions. The broader source has 460 omissions across Modules 7–10. A runtime bank that is directly mutated and subsequently emptied can no longer resurrect its legacy fallback. Unknown container names now fail visibly beside otherwise valid files.
5. **Actionable coverage:** unsupported senior rows now retain their questions, explanation status, raw metadata, source position and curriculum identity in `unsupportedQuestions`. Short-answer review rows retain their ID, type, file and source index in `skippedQuestionTypes`; they are outside this MC-only import. Audit schema version is now 2; existing fields are retained and the new sections are additive.

## Exact reproduction result

On 84 complete senior bank files plus five sampled review files:

- 7,043 emitted candidates: 7,034 bank rows and nine sampled review MC rows.
- 3,933 curriculum-blocked MC rows: 3,919 bank rows and 14 sampled review MC rows.
- Two sampled non-MC review rows are recorded separately.
- 43 blocked senior files: 40 banks and three sampled reviews.
- 460 legacy source omissions; zero emitted scaffolds; zero malformed-file errors, quarantined emitted-scope rows or duplicate IDs in this pinned run.
- All 7,043 emitted candidates have non-placeholder explanation text. Every assessment still says `contentReview: not-assessed`. This proves presence only, not scientific correctness, answer correctness or syllabus review.
- **Importer exit 1 remains required** because curriculum coverage is incomplete. Output-file existence is not release or seed approval.

Compared with the published PR normalizer on the same files: remove 1,061 wrongly classified Extension 2 rows and regain 152 supported Physics rows. Candidate delta is −909 emitted rows. No other previously emitted ID is removed. The prior three-file bounded sample still emits 321 Physics plus 40 Extension 1, with 120 source omissions and Biology FA1 explicitly blocked.

## Curriculum identity: required contract

A question must retain its source course, source year, unit path and source version independently of any display label or historical lesson ID. Numeric coincidence, similarly named topics, or a `-m5-` substring is not evidence of equivalence.

- The pinned [Biology map](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/subjects/biology/curriculum-map.json) identifies three Year 11 focus areas with `BI-11-01` through `BI-11-03`; the [Physics map](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/subjects/physics/curriculum-map.json) uses `PY-11-01` through `PY-11-03`. The pinned [quiz schedule](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/quiz-schedule.js#L9-L23) explicitly identifies the Year 11 2025-syllabus cutover. Legends' [syllabus consumer](../lib/syllabus.ts) instead uses the older four-module Year 11 names and codes. No source or target contract establishes FA1 = module-1. That mapping stays blocked.
- The Maths Standard map identifies Bivariate data analysis as `MST-12-S2-08`, but its current source rows/review files retain historical `maths-std-y12-m5-...` IDs. Neither the `8` in the outcome nor the `m5` in the ID authorizes an import module.
- The [review manifest](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/data/review-manifest.json) is route evidence, not a guaranteed curriculum identity oracle: its Maths Advanced Year 12 grouping includes a Year 11 `probability-and-data` review path. This batch does not rewrite the manifest or infer year from its grouping.
- Existing exact module paths remain compatibility candidates marked `legacy-module-path-only`; even an exact curriculum-map match is source evidence, not approval. Missing current map entries are explicit. Malformed maps or mismatched map subjects fail visibly. A revised data model must define course/syllabus version, stable unit IDs, migrations, selectors and visible labels together, with reviewed source evidence. No part of that target change was invented here.

## Remaining release blockers, not changed

- `scripts/seed-rest.mjs` drops syllabus-tier audit metadata. The source adapter expressly separates extension material from core mastery. Importing the 430 tagged rows through that seed contract would not preserve this distinction. Do not seed this candidate; retain a reviewed tier contract first.
- `lib/syllabus.ts` exposes only Modules 1–6 for Standard and Advanced Maths, while the emitted compatibility candidates include 246 rows in Modules 7–8 (Advanced: 88 + 3; Standard: 79 + 76). Their Topics tiles are not represented in that list. No UI or selector changes were made.
- The complete foundational schema and live status/receipt/explanation RPC contracts are still absent. The uncached answer-receipt regression remains real and red. Scientific review requires explicit versioned evidence, not explanation length or a generic `verified` flag.
- Legacy source repairs and default difficulty/Bloom conversions remain existing compatibility behavior. Raw metadata is retained, but these conversions are not a reviewed syllabus mapping. No database evidence was collected.

## Validation and review handoff

- `npm test`: **104 passed**, preserving all 90 earlier tests and adding 14 coverage tests.
- `npm run test:all`: **exit 1**, two existing product regressions pass and uncached receipt recovery still fails; no skips, TODOs or inverted assertions.
- Focused lint for the four changed/new executable files and TypeScript: passed.
- Eight isolated negative mutations were detected by assertion failures: Extension 2 fall-through, invented FA alias, dropped letter keys, dropped dot-point metadata, legacy-over-runtime merge, forgotten empty-runtime mutation, hidden unknown container and falsely clean partial coverage. Syntax/setup failures were not counted as detections.
- Full project lint (excluding only the separate fetched evidence directory) still fails with the same 34 errors and 16 warnings. Build was not rerun: this increment changes only importer code, fixtures and documentation; the published head's earlier placeholder-target build is historical evidence. No browser, production, account or database tests were run.

An independent review is still required before publication. This local follow-on does not change draft PR #2 remotely or make it ready to merge.
