# HSC Legends: game-platform delivery plan

Prepared 14 October 2026. Planning document; no implementation, database change or deployment is authorized by its existence. Based on the local repository audit, not a fresh inspection of the deployed database or a browser playtest.

## Product outcome

HSC Legends is a game platform where NSW senior students join classroom competitions or play solo using questions matched to their course and syllabus version. The first screen must communicate that through visible games, characters and prominent Join, Host and Play Solo actions.

The defining loop is: answer a meaningful HSC question → earn an in-session resource → make a game decision → see its consequence → learn from feedback → play again. Persistent XP, cosmetics and mastery support that loop.

This plan proposes replacing the existing Duolingo-first hierarchy. Historical product documents remain evidence of earlier decisions; they should be reconciled when implementation starts. Blooket/Gimkit provide interaction references; use original branding, artwork and mechanics.

## Completion and scope

There are two delivery endpoints:

1. Launch-ready beta: two finished flagship games, a dependable classroom flow, reviewed initial content, coherent art, accessibility and operational readiness.
2. Complete supported-course release: all six currently supported courses have explicit reviewed coverage for their advertised year/syllabus versions, and secondary modes have either met the same release standard or been deliberately retired from public navigation.

The supported courses are Biology, Chemistry, Physics, Maths Standard, Maths Advanced and Maths Extension 1. Other HSC courses are future scope. MCQ-based games do not represent complete preparation for written-response HSC examinations; the product must describe its scope honestly.

Initial beta content assumption: one reviewed Year 12 Chemistry unit, with 150–250 distinct questions, then additional reviewed units. Confirm this choice using actual learner/teacher demand and available content reviewers. Do not advertise unsupported units as available.

### Release modes

| Mode | Role | Delivery decision |
| --- | --- | --- |
| Knockout | Classroom flagship | Finish and harden first; add useful play for eliminated students |
| Tycoon | Solo flagship | Finish an earn/spend/build loop with a visible evolving environment |
| Classic classroom quiz | Teacher fallback | Retain a simple, reliable host-controlled option |
| Campaign | Solo expansion | Preserve existing work; polish after flagship validation |
| Heist | Action expansion | Hold competitive rollout until authority and touch controls are resolved |
| Duel, Gamble, Match | Secondary experiences | Review learning value, reliability and demand before promoting |
| Study/review/exam/progress | Learning support | Accessible from secondary navigation and postgame feedback |
| Seasons, rewards, cards, social systems | Supporting progression | Consolidate existing systems; avoid new ones until core play is validated |

Do not delete functional routes merely to simplify navigation. Preserve useful code and saved progress. Unsupported modes need clear availability messaging and server-side restrictions if their rewards or actions remain reachable.

## Experience design

### Student arrival

- Join field is immediately visible and accepts a code or shared link.
- Play Solo shows two or three large illustrated previews, duration, player count and a brief mechanics description.
- Course/year selection offers only reviewed available content. Account creation is deferred until needed to persist progression; guest room access needs a secure participant identity.
- A newcomer can reach their first solo question in three meaningful steps or fewer.
- Daily challenges appear as game invitations rather than homework cards.

### Teacher flow

Choose course/version/unit or question set → choose mode → settings → projector lobby/code/link/QR → start → observe/control → review results → replay or assign practice.

Include teacher-paced play, reviewed timer/scoring choices, readable projector views, server-backed pause/extend controls where supported, alias moderation, late joins and disconnect recovery. A display-only team grouping must not be presented as a scored team mode.

### Navigation and layout

Primary destinations: Play, Join, Host, My Legend. Put Study and Progress within a clearly accessible learning destination. Desktop uses a broad game hub; phones use a touch-first layout. Active games keep clear exit/reconnect affordances without crowding the play surface.

Use a shared shell for lobby, game HUD, feedback, results and replay, while keeping each mode visually distinct. Use original lab/arena scenery, large character silhouettes and readable resource counters. Keep question text on a quiet, high-contrast surface.

## Phase 0: establish a reproducible baseline

Deliverables:

- Record commit, dependency versions, route inventory, asset inventory and current test failures.
- Diagnose the three locally failing offline test files before inferring product defects from their file-level failure summaries. Run the regression suite separately because test:all short-circuits after offline failures.
- Establish repeatable lint, TypeScript, build, offline and regression commands. Fix genuine defects; retain unresolved acceptance failures visibly until implemented.
- Inventory retained SQL versus the actual staging schema; document missing functions, grants and migrations. Use a separate staging project and synthetic data.
- Inspect auth, guest identity, room access, content reads, scoring and reward claims across all reachable modes.
- Read installed Next.js guides before code changes, as required by AGENTS.md.

Acceptance: another developer can reproduce the environment and explain every failing required check. A build pass is recorded as compilation evidence, never gameplay proof.

## Phase 1: product and visual specification

Deliverables:

- Wireframes for home, game library, host setup, projector lobby, student lobby, both flagship HUDs, feedback and results.
- One explicit rule sheet per flagship: win condition, session duration, score/resource rules, upgrades, tie policy, late joins, elimination, pause, disconnect and reward handling.
- Original art direction: stylized science-fantasy lab/arena, bold silhouettes, restrained environmental detail, consistent perspective and lighting. Suitable for older students rather than infant-style educational art.
- Design tokens and reusable UI primitives for buttons, HUD, timers, game cards, status, results and accessible feedback.
- Art samples: one character, one lab scene and one illustrated mode card, tested inside real responsive layouts.

Acceptance: in a small five-person first-impression test, at least four identify it as a game platform and find Join/Play without prompting. Students and teachers can explain the proposed game rules after seeing the preview.

Phase 1 can proceed alongside backend hardening. Final art production follows approval of the visual direction, reducing discarded assets.

## Phase 2: authoritative and recoverable game core

Deliverables:

- Versioned session states and legal transitions: lobby, active/reading/reveal where relevant, paused, finished and abandoned.
- Authenticated teacher ownership and secure guest participant credentials. A public player UUID alone cannot authorize actions.
- Server-owned question selection, grading, deadlines, rewards, shop prices and purchases. Use transactions and explicit idempotency for answers, advances and completion claims.
- Resolve Knockout caller-supplied player authority; audit equivalent entrypoints across all modes.
- Restrict answer keys and private Gamble choices until their authorized reveal phase; scope room reads to allowed participants/hosts.
- Resolve Heist browser-reported outcomes. Implement server-verifiable reward events or keep the action simulation unranked with capped/noncompetitive rewards until a reviewed design exists.
- Durable answer receipts and snapshot recovery: question/version, submitted choice, score/resource delta and authorized feedback. A reconnect must recover an uncached acknowledged answer.
- Treat realtime messages as notifications; resynchronize from authoritative snapshots. Handle missed/duplicate/out-of-order events and stale callbacks.
- Server-backed pause/deadline changes, participant moderation and explicit host-disconnect policy.
- Rate limits, restricted function execution, bounded payloads, validated redirects and session-scoped data access.

Acceptance: staging tests prove unauthorized actions fail; one answer/purchase/claim cannot award twice; simultaneous attempts remain consistent; reconnect never requires fabricating a receipt. Refresh, late join and missed events recover correctly.

Architecture: retain Next.js and Supabase initially. Isolate UI from a typed game-session adapter and mode rules. Use Postgres transactions/RPCs for economic and scoring authority. Defer a new websocket/game-server stack unless measured action-game requirements justify it.

## Phase 3: trusted HSC content pipeline

Deliverables:

- Content identity includes course, school year, syllabus version, stable unit/topic/outcome, source/version and core/extension tier.
- Establish reviewed mappings for blocked sources; preserve unsupported rows for diagnosis rather than guessing identities.
- Preserve extension metadata through import/seed/selection; represent Maths Modules 7–8 where valid in the topic map.
- Separate structural validity, explanation presence, scientific review and syllabus review. Replace misleading uses of the legacy verified heuristic.
- Quarantine malformed notation, ambiguous distractors, incorrect keys, duplicates and media problems. Render-check maths and scientific notation.
- Store reviewed explanations and provenance; expose them only at the authorized gameplay phase.
- Add course/version coverage reporting and a question-report/correction workflow. Corrections create versions without corrupting historical receipts.
- AI may draft explanations or detect suspected defects; educator review approves release content.

Acceptance: every question in the beta set has an approved key, explanation and course/version mapping. A reviewer can trace provenance. Wrong-answer feedback remains available regardless of cosmetic purchases. Full-course release requires published coverage boundaries and review of every released question, not just a count target.

## Phase 4: complete the two flagship games

### Knockout

- Cohesive illustrated arena, readable player roster and clear live stakes.
- Simple onboarding, server-timed rounds, clear reveal and leaderboard transitions.
- Eliminated players continue unranked learning or spectate; avoid leaving students idle for most of a lesson.
- Optional bounded power-ups with explicit rules and server enforcement.
- Projector-friendly host controls, recovery, fair ties, late-join rules and useful results.

### Tycoon

- Visible lab starts small and evolves through purchased equipment and upgrades.
- Answer → earn energy/credits → choose upgrade → see an immediate gameplay effect.
- Upgrade choices create genuine tradeoffs; document costs, caps and win/end conditions.
- Reviewed explanations are accessible without blocking every action behind lengthy text.
- Solo runs have replay variation without repetitive question farming for persistent rewards.
- Local practice can remain offline; persistent/ranked rewards require server-validated receipts.
- Evaluate the existing Equilibrium Lab prototype as a source of ideas/content after science and browser acceptance; it is not automatically integrated or production-ready.

Acceptance: newcomers understand both loops within one session, spend resources voluntarily, see meaningful consequences, and can finish/replay. Conduct student playtests and tune using observed behaviour. Record balance changes rather than declaring fun from source tests.

## Phase 5: art production, motion and audio

Asset sources and responsibilities:

| Asset | Production method |
| --- | --- |
| Characters, backgrounds, illustrated game previews | Image generator with approved references |
| Buttons, gauges, timers, borders, ordinary UI icons | CSS/SVG and existing icon system |
| Character motion, hits, particles, transitions | Code animation; reviewed pose assets where needed |
| Scientific diagrams/equations | Deterministic SVG/KaTeX with educator review |
| Sound effects | Original synthesized effects or licensed assets with attribution records |

Codex/Claude can direct and implement the art workflow. The raster artwork comes from an image model or artist. Earlier repository guides describe OpenArt/FLUX and Higgsfield workflows; those guides do not establish the provenance of every existing file.

The current implementation uses the built-in image-generation tool for original raster artwork, including transparent characters. Its exact underlying model and model selector are not exposed in this session. Do not assign an unverified model name to these assets. A future API workflow should verify the actual available model IDs, capabilities and pricing for the account before choosing a model or estimating spend. Record the execution method and provenance for every delivered asset.

Proposed beta art pack:

- One hero scene, two flagship previews, one arena background and one lab background.
- Four player characters: one approved master each, with idle/action/hurt/celebrate variants where actually consumed (up to 16 assets).
- Six Tycoon equipment illustrations, retaining vector assets when clearer.
- Reuse existing bosses/fighters after visual/provenance review; generate replacements only where necessary.
- Shared resource and reward symbols drawn as SVG unless illustration adds value.

Pipeline: inventory → three style explorations → select master reference → generate a small coherent pack → inspect at actual UI sizes → integrate → extend. Never batch dozens of unrelated prompts before style acceptance.

Each asset record contains source/model if known, prompt, reference IDs, license/usage notes, dimensions, intended surface and approval status. Preserve masters separately from optimized delivery files. Characters need consistent framing, scale and alpha edges. Backgrounds need readable UI zones. Avoid baked-in interface text; render labels in code.

Targets: mode preview ≤200 KB; typical scene ≤400 KB; character pose ≤150 KB where achievable without visible damage. Lazy-load nonactive mode art, reserve dimensions and preload only critical assets. Build animation with transforms/pose changes rather than generating a video for each interaction. Support mute, reduced motion and noncolour-only feedback.

Acceptance: no unintended style drift or broken cutouts, no layout shifts from art, and smooth play on target phones/laptops. Decorative art must never substitute for readable question content or accurate diagrams.

## Phase 6: platform polish and teacher value

- Integrate shared progression once per validated session, with clear distinctions between match resources and persistent currency.
- Clear replay, invite and review-mistakes actions; teacher reports use authoritative final populations, choices and counts.
- Keyboard/touch support, visible focus, labelled controls, zoom support, reduced motion, contrast and screen-reader status announcements.
- Mobile layouts for questions, HUD and shop; no required keyboard-only mechanic in a mode advertised for phones.
- Auth persistence, safe redirects, logout/account-change cleanup and resilient loading/error/empty states.
- Privacy-aware classroom aliases, minimal retained student data, retention/deletion policy and teacher-facing usage guidance.
- Service-worker update/cache behaviour verified so releases do not serve incompatible game code.

Acceptance: key flows pass keyboard and mobile testing, projector text is readable, and the teacher can identify mistakes/reteach from actual final results. All cosmetic/reward systems respect server authority and provide honest feedback.

## Phase 7: staging validation and classroom pilot

Required automated checks:

- Offline rules/adapters and known-regression suites, without suppressing failures.
- Staging database authorization/idempotency/concurrency tests.
- Browser end-to-end host/guest/solo/account flows.
- Tests for refresh during submission, uncached rejoin, host restart, pause/resume, late join, end-game races and repeated reward claims.
- Target load: one teacher and 30 concurrently connected students per room, multiple active rooms, with delayed/duplicate/missed updates. Choose production capacity from measured results.
- Screen-size and accessibility smoke checks; actual device acceptance supplements automation.

Pilot: begin with 5–10 students and a teacher, then run at least three full 20–30-player classroom sessions across two classes. Include normal school wifi and mixed phone/laptop devices. Capture session failures without recording unnecessary personal data.

Proposed acceptance targets: ≥95% successful first-attempt joins; zero duplicated rewards, unauthorized submissions or irrecoverably lost acknowledged answers; at least four of five solo testers can explain upgrades without help. Measure question-view-to-feedback latency and recovery latency; tune explicit thresholds after a staging baseline. Suggested recovery target is within five seconds after connectivity resumes.

Track replay choice, completed games, meaningful resource purchases, teacher reuse and correction/retry success. Engagement is not proof of HSC learning effectiveness; evaluate learning separately with reviewed questions.

## Phase 8: launch and supported-course completion

Beta launch prerequisites: no unresolved critical authority/content defects; all required suites pass; real-device/pilot acceptance recorded; reviewed content bounds visible; deployment/rollback, backups and monitoring tested.

Release behind mode/content flags. Retain prior deploy and migration recovery guidance. Monitor failed joins/submissions/recovery/claims, game abandonment, latency and reported bad questions. Assign ownership for incidents and content corrections.

After beta, expand one reviewed course/unit at a time. Maintain a matrix of course × year × syllabus version × unit × released question count × review status. Repeat import/render/content acceptance on every new batch. Advertise full supported-course release only when that matrix meets the declared coverage contract.

Then graduate Campaign and other modes individually through authority, feedback, accessibility and playtest gates. Heist requires server-verifiable rewards plus acceptable touch controls or explicit desktop-only positioning. Retire modes that fail to justify their maintenance cost after pilot evidence.

## Work packages and ownership

| Package | Owner role | Depends on | Completion evidence |
| --- | --- | --- | --- |
| Baseline/CI | Engineering | None | Reproducible logs and failure triage |
| Product/rules/art direction | Product + design | Audit | Screens and rule sheets accepted |
| Session/auth/economy authority | Backend engineer | Baseline/rules | Staging adversarial and recovery tests |
| Content identity/review | Content engineer + educator | Baseline | Approved versioned beta set |
| Shared UI and art integration | Frontend + art | Visual direction | Responsive browser/device checks |
| Knockout | Gameplay engineer | Core/content/UI | Full classroom session acceptance |
| Tycoon | Gameplay engineer | Core/content/UI | Full solo session acceptance |
| Reports/accessibility/operations | Engineering + teacher | Flagships | Acceptance records and runbooks |
| Pilot/release | Product + engineering + teacher | All launch gates | Pilot evidence and launch decision |
| Course/mode expansion | Content + engineering | Beta outcomes | Coverage matrix and mode gates |

Roles may be performed by the same person. AI coding agents can handle bounded implementation and review tasks; they cannot substitute for teacher/content or student playtest acceptance. Keep shared schema, rules and design tokens under one integrator to avoid conflicting parallel changes.

## Scheduling and budget assumptions

Working estimate for one experienced integrator with AI assistance and available teacher/content reviewers: 8–12 calendar weeks for a launch-ready beta. This is a planning range, not a commitment; re-estimate after baseline and backend inventory. Missing foundational schema or substantial content defects can materially extend it.

- Weeks 1–2: baseline, rules, art samples and staging authority work.
- Weeks 2–4: recoverable core and reviewed beta content; shared game-first interface in parallel.
- Weeks 4–7: complete flagships, integrate final art and teacher reports.
- Weeks 7–9: staging/browser/device testing, pilot and balance fixes.
- Weeks 9–12: remaining launch issues, controlled rollout and monitoring.

Supported-course completion is a separate rolling programme. Estimate after measuring review throughput on the first 100 questions: remaining review hours = remaining unique questions / approved questions per reviewer-hour, plus mapping, correction and integration time. Historical 9,395-row counts are not a current scope or review estimate. Assign staffing and dates from the measured inventory.

Budget categories: staging/hosting, image generations and iterations, licensed audio if used, educator review, device/browser testing and ongoing operations. Log a small art sample's actual generation cost, then forecast approved assets plus expected revisions. No exact image spend or access is assumed, and no paid generation is initiated by this plan.

## Execution order and immediate next work

1. Reproduce/diagnose test failures and record baseline.
2. Produce flagship rule sheets and three art-direction samples.
3. Establish staging schema/permission inventory and implement authoritative identity/receipts.
4. Review a bounded Chemistry unit while building the game-first shell.
5. Finish Knockout and Tycoon against the same approved content/session interfaces.
6. Complete art, reports, accessibility and real-device validation.
7. Pilot, fix observed failures and release the bounded beta.
8. Expand the advertised coverage and graduate remaining modes through the same gates.

The plan is complete as a delivery specification. Product completion requires the evidence above; route count, generated art and passing source tests alone do not satisfy it.
