# Question integrity: offline ingestion audit

Date: 2026-10-04. Local candidate only. No database access, publication or deployment.

## Result

The importer no longer restores legacy questions that the source runtime deliberately omitted. It validates actual text and integer answer keys, preserves available instructional metadata, quarantines media-dependent items rather than silently dropping their diagrams, and emits an audit sidecar. This is ingestion and source-contract checking. It is not a scientific or syllabus review.

### Exact baselines

- HSCLegends main: `1b192e23b39863b9be8b658c9af51bf7f2d1ba24`.
- Existing safe-foundation patch preserved without replacing it: SHA-256 `1ea5adf4c60077f4e312dd5c7a1a3b2f2658e2214df82c6e398175627c63399e` (v7).
- Teaching-APP sample: `99d107b14e525ef538448bf9260af2b51e453865`. Three files fetched through the authorized source connector; their Git blob hashes were checked locally. No full current bank snapshot was available.

## Source findings and bounded sample

1. The [retained legacy flag](../supabase/migrations/20260703_content_qa.sql) is true when an item is not excluded and its trimmed explanation has at least three characters. This is not evidence of answer correctness, scientific review or syllabus alignment. The historical 9,395-question and 899-missing-explanation figures were not rechecked and must not be presented as current.
2. The old normalizer merged `lessonQuestionBanks` over `window.HSCQuestionBankData`. In the pinned [Extension 1 Module 9 source](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/subjects/maths-advanced/extension1/year12/module9/question-bank-data.js), the legacy container has 160 lesson questions, including 120 scaffolds. The runtime publishes only 40. The old importer restored all 160. The candidate keeps the 40 runtime entries and records the 120 source omissions. It also keeps their wired calculus topic and difficulty 3; the old legacy override had downgraded them to general/difficulty 2.
3. The pinned [Physics Year 12 Module 5 source](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/subjects/physics/year12/module5/question-bank-data.js) contributes 321 questions. The sidecar preserves 37 `syllabusTier: extension` tags, 16 raw difficulty-4 values, 14 `evaluate` and one `synthesise` Bloom value. Existing compatibility-field conversions are unchanged; the raw values are retained separately for a reviewed future mapping.
4. The pinned [Biology Year 11 FA1 source](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/subjects/biology/year11/fa1-cells-as-the-basis-of-life/question-bank-data.js) has 250 runtime questions. Its new focus-area layout is outside the existing module classifier. The candidate explicitly reports that file and exits 1 for incomplete HSC coverage. It does not invent a focus-area-to-module mapping.
5. The sample run emits 361 questions: 321 Physics and 40 Extension 1. It reports 120 source omissions, one unsupported HSC file, no emitted scaffolds, no duplicate IDs and no malformed-file errors. Exit 1 is intentional because Biology coverage is incomplete. The old sample emitted 481, including the 120 scaffolds, while hiding the Biology omission. None of these are whole-bank or production counts.
6. These samples contain no `media` or `syllabusPoint` values. Preservation of those optional fields is verified with synthetic fixtures, not claimed as a measured sample-content defect. The original importer unconditionally wrote `syllabusPoint: null` and never retained media.
7. [LiveQuestion and submitAnswer](../lib/live.ts) have no explanation field. The complete server definitions are absent. Adding a client property would not make explanations available. No client type, database schema or RPC contract was changed.

## Candidate behavior

- Reject malformed/null questions, blank/non-string stems or options, duplicate option text, noninteger/nonfinite/out-of-range answer indices and conflicting answer keys. Do not turn objects or nulls into answer strings.
- Match the source's narrow scaffold templates and quarantine all-label option sets for review. This is a conservative content-presence check, not a subject-matter judgment.
- Honor an explicitly assigned runtime bank even when empty. When no runtime bank is published/populated, support the legacy-only container. Never merge omitted legacy lessons back into a runtime bank.
- Retain string `syllabusPoint` values in compatible output. Preserve structured values in diagnostics and quarantine them rather than coercing them into a database text field.
- Preserve media JSON, captions, alternate text and links in quarantine diagnostics. Do not fetch assets. Any non-null media needs a reviewed renderer contract before text-only import. Empty media objects are also ambiguous and quarantined.
- Preserve raw difficulty, Bloom, band and syllabus-tier metadata in the sidecar. Do not expand existing database enums or invent curriculum mappings.
- Report `explanationStatus` as `present`, `missing` or `placeholder`; every assessed row has `contentReview: not-assessed`. Presence is not a correctness label. Missing explanations remain valid text-question candidates, but cannot support meaningful explanation feedback without editorial work.
- The machine-readable sidecar is `<output>.audit.json`, with per-question provenance, reasons, raw metadata, source omissions, unsupported paths, malformed files and duplicate IDs. Output can exist after a failed audit, so its presence is not an approval to seed.
- Exit 1 on malformed files/containers, unsupported HSC layouts, quarantined questions, duplicate IDs or no emitted questions. Paths outside the supported HSC subjects/years are reported but do not alone fail the HSC audit.

## Reproduce safely

From the checkout, after the existing safe-foundation patch:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --import ./tests/support/deny-network.mjs --test tests/offline/question-integrity.test.mjs
node --import ./tests/support/deny-network.mjs scripts/normalise-banks.mjs /path/to/trusted-checkout out/questions.json
npm run test:all
```

Only use trusted source checkouts. `node:vm` is not a security sandbox. The test preload is an accidental-network-use guard, not an OS firewall. No credentials or environment files are required. Do not run `seed-rest.mjs`: it still hardcodes a production write destination. Do not apply generated SQL or run legacy production scripts. Existing seed paths ignore audit fields and are outside this candidate's approved workflow.

## Verification

Node 24.19.0. Seventeen new importer tests pass. All 90 offline tests pass (73 preserved foundation checks plus 17 new checks). TypeScript, focused lint and the Next build with a loopback placeholder target pass. The first build attempt lacked the runtime network proxy and could not fetch Google Fonts; retrying with that proxy succeeded. No production keys were supplied. This is compilation/prerendering evidence, not connected gameplay. Full lint retains 34 errors and 16 warnings. The required aggregate remains exit 1: stable teams and active-host recovery pass, but uncached answer-receipt recovery is still the intentional real failure. No skips or inverted expected failures were added. No connected browser, live game, database or student-account tests were run. An independent read-only reviewer reran all 17 focused tests and the three-file sample, confirmed the counts and metadata, and found no remaining blocker within this bounded scope. Reviewed normalizer SHA-256: `58ad3d0f87b1c18ecea3e7531dfe44dc4905401fd5334311f4ba1d66ff0c2692`.

## Backend and editorial plan, not implemented

Before live explanation support or broader ingestion, retain complete, versioned schema and selector/RPC definitions from an explicitly authorized source. Establish a disposable local test database with synthetic data. Verify ownership and reveal timing so answer/explanation metadata is returned only at the intended teaching moment. Test that the same question ID/version, answer index and explanation survive submission, reconnect and round advancement. Define supported media fields, rendering, safety, asset access and accessibility before releasing media-dependent questions. Review focus-area curriculum mapping and taxonomy conversions with source evidence before changing selection or storage. A scientific/syllabus-review status needs explicit review evidence, reviewer/date/version provenance and revocation on content change; never infer it from explanation length.
