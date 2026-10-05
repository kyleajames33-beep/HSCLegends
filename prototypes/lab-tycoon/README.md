# Equilibrium Lab: offline Lab Tycoon prototype

**OFFLINE PROTOTYPE / SAMPLE CONTENT — not a live classroom game.**

A bounded, solo concept study for brainstorm item 16. It is not production-ready, connected to HSC Legends, an assessment, or evidence that the classroom backend is reliable. The real app routes and existing Tycoon mode are unchanged.

## Try the artifact

Open `lab-tycoon.html` in a modern browser. It is one self-contained file, with no downloads, account, server, installation or network request needed. The browser must support JavaScript, native dialog, structuredClone and modern CSS. File-opening and localStorage policies vary by browser; if local saving is unavailable, a visible message says that progress is memory-only. Keep that tab open to retain that run.

Visual/browser acceptance has **not been run** in this environment. No screenshot is included or fabricated. Source tests execute generated UI handlers against a scripted DOM double; they do not establish browser layout, native keyboard behaviour, storage behaviour on file URLs, screen-reader quality or mobile acceptance.

## Scope and learning loop

**NSW Chemistry Stage 6 (2017), Year 12, Module 5: selected equilibrium fundamentals.** Twelve original authored examples cover dynamic equilibrium; a closed system; concentration disturbances; compression with unequal/equal gas-mole totals; endothermic temperature response; catalysts; writing and calculating Kc; Qc versus Kc; pure solids; and what changes Kc.

The scope does not cover all of Module 5, acid reactions or solubility calculations. It is not a junior-science question bank and has no claim of official NESA endorsement, calibrated difficulty, completeness, guaranteed outcomes or classroom suitability. Educator review and learner testing remain required.

1. **Learn:** a brief concept note with the relevant equation, read at the learner's pace.
2. **Answer + reason:** select one answer and one explanation. Both are required; there is no timer.
3. **Explain:** see the actual selected options, correct answer/reason and a worked explanation. Revisit the same note for free. When either part was wrong, choose one optional retry before finishing review.
4. **Earn:** credits are derived from a transparent per-question receipt, not a hidden multiplier.
5. **Choose:** buy one-time equipment for the local bench or save for later. Installed equipment shows a study note; all core learning help and accessibility controls remain available without buying anything.
6. **Next challenge:** repeat through a finite 12-item sequence, then review a notebook containing all explanations.

These are conceptual chemical scenarios, not instructions for a real experiment or for handling hazardous chemicals.

## Deterministic economy

- First submission: correct answer **4**, correct reason **4**.
- One optional retry: each previously incorrect part corrected earns **2**. An already earned part never pays again and is never deducted.
- Choosing **Finish review**: **2** once per challenge, regardless of accuracy. This rewards completion of the review step; the app cannot establish that the explanation was read or understood.
- Maximum **10 per challenge**, **120 per run**. Wrong twice with review still earns 2 for engaging with the review step.
- Available credits = earned credits − equipment costs. The visible receipt breaks down answer, reasoning and review credits.
- Equipment costs: field notebook **6**, temperature station **12**, gas sensor **18**, analysis console **24**. Each is a one-time purchase, only in the post-review shop. All equipment costs 60 combined and is attainable in a strong run. Buying is optional.
- No passive income, random draw, speed reward, penalty streak, cash purchase, interest, multiplier, repeat-question farming, account XP or monetary value.

Correcting a mistake is worth less than getting that part right initially, but still receives an explicit learning reward. A retry is open-book practice after feedback, not an independent assessment.

## Isolation and storage

The HTML has no imported assets, remote fonts, service worker, fetch, socket, analytics, account or database client. Content Security Policy denies connections and form submission. The design borrows the inspected repository's warm parchment/plum palette and chunky card/button style; all small apparatus diagrams are source-authored inline SVG, with no external images or paid generation.

The only optional persistence is two namespaced localStorage entries:

- `hsclegends.offline-equilibrium.v1`: versioned action log for the current run.
- `hsclegends.offline-equilibrium.v1.undo`: the last pre-reset run.

No names, email addresses, class identifiers, student records, free-text responses, credentials or device identifiers are collected. The checkpoint contains chosen option numbers, completed steps, upgrades and internal revision numbers only. These entries are independent from existing app storage; the prototype never calls localStorage.clear or deletes another key.

Checkpoint loading replays a bounded valid action log and re-derives money. It rejects incompatible content revisions, invalid phase transitions, invalid choices and impossible duplicate events. It does not trust a stored score. Corrupt checkpoints are preserved during ordinary play; the learner can choose an explicit reset to replace them. Storage failures are visible, and ordinary progress refuses to overwrite a detected newer checkpoint from another tab. Use one active tab; this local-storage scheme is not transactional multi-tab synchronization or a security boundary.

**Reset** first opens a native confirmation dialog with a cancel option. Confirming replaces this prototype's current run, keeping its last run as an undo backup when storage works and in memory while the tab stays open. A second reset replaces that backup. Undo restores the previous action log without an extra award and rebases revision ownership so retained handlers cannot become valid again. A retained backup may offer undo again after reload; restoring it is a rollback, never an additive credit operation.

Anyone with developer tools can change or replace local data and read the bundled answer keys. It is deliberately not competitive or anti-cheat. It cannot authenticate a learner or certify progress.

## Source architecture and checks

From this directory, with Node 24 (used here):

```sh
npm test
npm run build
```

There are no dependencies and no package install is needed. `npm test` rebuilds the HTML before executing the tests, avoiding stale bundle checks. The generator concatenates the three local modules into a self-contained script and inlines CSS. It makes no Next.js framework change or production build claim.

- `src/content.mjs`: pinned sample content, keys, learning notes and equipment definitions.
- `src/model.mjs`: pure state machine, accounting, eligibility, action-log validation and checkpoint functions.
- `src/app.mjs`: UI, local persistence and native-dialog/reset handling.
- `src/styles.css`: scoped standalone styling, responsive layout, visible focus styling and larger-text option. No animations are used; reduced-motion overrides are retained.
- `tests/model.test.mjs`: phase validity, duplicate/stale handlers, double awards, retry bounds, upgrade funds and duplication, strict scoring ceiling, all option combinations, checkpoints, reset/undo and storage failures.
- `tests/science.test.mjs`: all 12 pinned answer/reason keys, item structure, independently recalculated numeric example, compression ratio and atom balance checks. Automated agreement does not replace scientific/teacher review.
- `tests/app.test.mjs`: actual generated script through the initial state, answer/reason submit, retry, shop, full run, confirmation/cancel/reset/undo, corrupt storage and newer-tab conflict, using an explicitly limited DOM double. V2 also reproduces retained form changes during feedback/later questions/retries, retained undo/reset controls, and unsafe imported counters.

The implementation's duplicate guards use a state revision captured by each rendered control. Answer selections belong to their exact current form, and reset/undo controls must still be the current elements; undo also captures the specific backup. Retained callbacks cannot populate another question or consume a later reset backup. Checkpoint base revisions are bounded at 1,000,000,000, with a maximum 100-event log and arithmetic headroom. Invalid counters are rejected; reset/restore fail closed if their new base would exceed the bound, with an explicit UI notice and no progress change. State/phase validation also rejects a second answer, completed review, unaffordable/repeated equipment purchase and terminal replay. There are no real-time or network concurrency claims.

## Science verification and sources

All stems, options, explanations and diagrams were written for this sample; no official exam question, source illustration or textbook passage was copied. Scientific principles were checked against the sources below on 4 October 2026. The questions use school-level concentration expressions and the stated ideal-gas/pure-solid assumptions.

- [NESA Chemistry Stage 6 Syllabus (2017)](https://www.nsw.gov.au/education-and-training/nesa/curriculum/science/chemistry-stage-6-2017): scope identity and Module 5 title.
- [NSW Department of Education, Chemistry 11–12](https://education.nsw.gov.au/teaching-and-learning/curriculum/science/planning-programming-and-assessing-science-11-12/Chemistry): 2017 syllabus remains the teaching basis until implementation of the new syllabus from 2028.
- [OpenStax Chemistry 2e, 13.1 Chemical Equilibria](https://openstax.org/books/chemistry-2e/pages/13-1-chemical-equilibria): equal opposing rates and continuing particle-level reaction (items 1–2).
- [OpenStax Chemistry 2e, 13.2 Equilibrium Constants](https://openstax.org/books/chemistry-2e/pages/13-2-equilibrium-constants): concentration expressions, Q/K comparison and heterogeneous systems (items 8–11).
- [OpenStax Chemistry 2e, 13.3 Shifting Equilibria](https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle): concentration, compression, temperature and catalyst distinctions (items 3–7 and 12).

### Answer/reason audit

Answer letters refer to four answer choices; reason letters refer to three independent reason choices.

| Item | Topic | Answer | Reason | Essential check |
|---|---|---|---|---|
| 1 | Dynamic equilibrium | A | B | Rates equal; concentrations need not be equal |
| 2 | Closed system | C | C | Retain gases, control temperature and allow time |
| 3 | Add H₂ | B | A | Net forward reaction consumes some added reactant |
| 4 | Compress SO₂/O₂/SO₃ | D | B | Three gas moles left, two right |
| 5 | Compress H₂/I₂/HI | A | C | Two gas moles each side; proportions unchanged, concentrations increase |
| 6 | Heat endothermic forward reaction | B | C | Forward direction favoured and Kc increases |
| 7 | Catalyst at equilibrium | C | A | Both rates accelerate; composition and Kc unchanged |
| 8 | Haber Kc expression | D | B | [NH₃]² / ([N₂][H₂]³) |
| 9 | Calculate Kc | A | C | 0.40² / (0.20 × 0.20) = 4.0 |
| 10 | Qc < Kc | B | A | Net forward reaction raises product/reactant ratio |
| 11 | Add pure CaCO₃ | C | B | Both solids remain present; fixed temperature/volume; Kc = [CO₂] |
| 12 | Change Kc | D | C | Change temperature while keeping equation fixed |

## Backend integration blockers

This prototype must not be imported into a live route and represented as a production game simply because its local tests pass. The reviewed source base is **1420bc9d21742b779aba8b2422b93eafccd37b71**. Work is confined to a new local branch/folder. No source file in the reviewed checkout was edited, and no app route, SQL, migration, grant, credential, account, deployment or PR was changed.

Before any future connected implementation:

1. Obtain the authorized, versioned complete classroom schema baseline and a disposable database/seed/reset contract. Existing additive migrations do not prove deployed semantics.
2. Resolve the existing uncached-answer receipt recovery failure. Client type declarations and local action logs are not proof of an authoritative server receipt.
3. Establish owner-bound participant/host identities, RLS and least-privilege permissions. Names/aliases are not authentication.
4. Agree versioned scoring, retry, review, pacing, accommodations and reset rules. This prototype's toy economy is a proposal, not an approved server policy.
5. Put submissions, question-instance ownership and awards in atomic, idempotent server transactions, with immutable receipts. Audit stale requests, simultaneous submits, cross-user replay, cross-device recovery and completion claims.
6. Keep unrevealed keys/explanations on the server for competitive modes. This offline artifact necessarily ships every key.
7. Define a safe content adapter preserving exact curriculum identity, content revision, approved explanations and extension labels. Do not insert this sample into a live bank without content review and explicit authorization.
8. Complete real supported-browser QA: desktop/mobile overflow, radio arrow navigation, Tab order, visible focus, dialog Escape/cancel/focus return, 200%/400% zoom, reduced motion, screen-reader announcements, refresh at each phase, file-origin persistence and storage failure/recovery.
9. Then test the proposed server implementation in a disposable synthetic classroom, with a host and 30 guests, genuine concurrent requests, reconnect/loss, privacy checks and independent review. No real student data is needed.

See the source repository's `docs/proposals/CLASSROOM-SERVER-CONTRACT.md` for the existing unimplemented contract and acceptance matrix. No backend or classroom acceptance item above was executed by this prototype.

## V2 review corrections

Independent source review found two robustness gaps in V1: retained input/undo callbacks were not sufficiently bound to their original controls, and a near-maximum integer checkpoint could exhaust precise revision arithmetic. Both were corrected without changing the question content, scoring formula or equipment prices. The suite now has 52 passing tests. Four new generated-script negative controls fail against the frozen V1 HTML as expected; see `verification/v1-negative-controls.txt`. This provides a regression signal, not browser-rendering evidence. Focused independent re-review of V2 is pending before packaging.
