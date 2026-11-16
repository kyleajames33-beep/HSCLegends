# Next-stage game and art execution plan

Updated 3 November 2026. This is an implementation backlog for the current repository, not a claim that the connected games are ready for a classroom. The broader release gates remain in `GAME_PLATFORM_DELIVERY_PLAN.md`; current security and test limits are in `IMPLEMENTATION_STATUS.md`.

## What exists and what the next increment must change

The dark arcade hub now offers two playable solo samples. `/demo` has two starting kits, distinct income/attack/time upgrades, a reactor boss with an exposed-core phase, Overclock, charged actions and richer replay/results. `/arena` adds Knockout Solo with simulated rivals, hearts, powers and survival rounds. Connected classroom Knockout remains unavailable. The connected Tycoon and Campaign screens have also been made more game-like, but still depend on the existing backend. Generated art provenance is recorded in `ART_ASSETS.md`.

| Work item | Current evidence | Remaining gate |
| --- | --- | --- |
| Dark illustrated hub and responsive navigation | Local phone/desktop browser checks | First-impression tests with real students |
| Lab Rush kit, shop, phase and replay decisions | Actual demo tests and mobile browser run; deterministic balance model in `LAB_RUSH_RULES.md` | Observed balance and comprehension tests |
| Knockout Solo | Pure rules and complete browser runs at three sizes | Content review and real-device/playtest acceptance |
| Offline installation and preview | No-backend production build and offline browser navigation | Device install/update checks |
| Connected classroom and shared wallet | Isolated authority candidates only | Real authenticated staging, reviewed cutover and classroom pilot |

The next increment should make a run feel different because of **choices and visible consequences**. It should give the player a clear objective and an immediate reason to play again, without hiding explanations or making a student's score depend on reading speed alone. Decorative currency or extra meters without a decision do not satisfy that goal.

## Priority 1: make Lab Rush a replayable arcade slice

**Outcome:** a player can explain what to do, choose a strategy, see the lab change and finish a 2–3 minute session on a phone.

1. **Tune the starting loadouts.** The sample now offers Blast Kit (90 seconds, 30-damage blast) and Time Kit (105 seconds, 20-damage blast). Both choices are local to the run and display their rules before starting. Compare them in a balance simulation and observed playtests; tune if one dominates, while keeping start to one screen.
2. **Tune the distinct shop roles.** Income Lab, Attack Bot and Time Reactor now show their cost and before/after effect. Measure whether slower players can reach useful purchases and whether each role changes their strategy. Preserve the timer pause while shopping and reviewing feedback.
3. **Validate the boss phase.** At 50 HP, an explicit exposed-core phase gives blasts 10 extra damage. Test whether players understand saving charge for damage versus spending it on time. Health remains visible as text and a bar.
4. **Validate results and replay.** The kit, damage, purchases, factual highlight, review and same-kit replay are now implemented. Check whether players voluntarily replay and try the alternative kit. Keep personal best device-local and identify it as such; do not imply a global leaderboard or persistent reward.
5. **Make every action legible.** Add restrained damage/cash/upgrade feedback, optional sound and reduced-motion alternatives. Use a live region for significant changes without announcing every timer tick. Controls remain keyboard usable, have visible focus, work at 320 px and support zoom.

**Acceptance:** automated rule tests cover both loadouts, costs, insufficient funds, phase transitions, timer pause, win/loss, duplicate and stale actions, and replay reset. Browser smoke tests exercise both strategies at 320 px and desktop with no horizontal overflow. In five observed first-time sessions, at least four players can identify the objective and explain one upgrade choice without prompting. Record completion time, choice and confusion; tune values from observations rather than claiming the mechanics are balanced from source tests alone. The Chemistry sample remains explicitly unreviewed until content review is complete.

## Priority 2: make the hub look and behave like a game library

**Outcome:** a newcomer can distinguish an available game from a preview and reach the playable sample quickly.

- Replace generic decorative mode icons with distinct illustrated cards for Lab Rush, Knockout and Campaign. Cards show solo/classroom, a short action-led description and a truthful availability state. Keep the Join/Host/Solo actions visually dominant and concise.
- Add a compact featured-game panel with a large Play action and a small preview of the actual objective; do not fill the home screen with progress widgets or marketing paragraphs.
- Treat unavailable connected modes honestly. The current production lockdown prevents assuming Knockout/Gamble are playable; never present a disabled server function as a working room. Keep existing routes and saved progress intact.
- After play, use a lightweight return-to-hub or replay action; do not require an account for the offline sample.

**Acceptance:** at 320 px, 390 px and desktop, the first screen exposes a clear way to play and does not horizontally scroll. Keyboard navigation and focus are visible. Five first-time testers can find the sample and distinguish it from unavailable connected modes; report the actual count rather than asserting success in advance.

## Priority 3: coherent art pack

Use original science-fantasy art with the established purple/teal lab, warm gold highlights, bold silhouettes and clear areas for live UI. The existing asset set is a starting reference, not proof of a final approved style. Draw numbers, buttons, gauges, icons and scientific notation in code; do not bake text into art.

| Asset | Purpose and delivery | Acceptance |
| --- | --- | --- |
| Lab Rush mode card | Landscape illustration showing the golem and lab, used in hub | Readable at phone card size; subject and UI label remain distinct |
| Knockout mode card and arena | Original competitive arena with open center and recognizable player silhouettes | Looks distinct from Lab Rush; no implication the locked mode is available |
| Campaign mode card | Boss encounter with a different silhouette and composition | Recognizable without relying on its title |
| Two Lab Rush core icons | Attack and research choices, preferably deterministic SVG | Meaning differs by shape and label, not color alone |
| Golem phase states | Reuse the existing master with a small number of pose/effect variants only if required | Consistent character and scale; reduced-motion state remains clear |
| Three equipment illustrations | Visualize attack, income and recovery upgrades in the lab | Each has a unique silhouette and reflects its actual rule |

Generate one asset or small related batch at a time using the existing masters as references where available; inspect in the real card and game surface before expanding. Use the available image-generation tool or a commissioned artist; record the exact model only when the tool exposes it. Keep source masters, delivery files, prompts, references, dimensions, license/usage notes and approval status in `ART_ASSETS.md`. Optimize and reserve dimensions to avoid layout shifts; initial targets are ≤200 KB per card, ≤400 KB per scene and ≤150 KB per character pose where quality permits. Use reviewed deterministic diagrams for actual science, never generated illustrations as evidence of scientific correctness.

## Priority 4: turn the classroom concept into a safe flagship

The next classroom playable slice is Knockout: host chooses a reviewed set, players join with secure participant identity, a server-owned clock and answer key govern a round, then all players see an understandable reveal and standings. Eliminated students need a useful unranked practice or spectator role so a class is not left waiting. Host controls need a readable room code, start, advance, reconnect and finish.

Implement against a disposable staging environment using the isolated classroom v2 and Gamble/Tycoon authority work as references, not as evidence of production readiness. First establish secure guest credentials, host ownership, private answer keys, durable receipts and an authenticated capability handshake. Then implement the round UI and reconnect from the authoritative snapshot. Treat realtime events as notifications and resynchronize after a gap. Do not open legacy RPC grants to make the screen appear functional.

**Acceptance:** signed-session staging tests reject a different actor's actions, duplicate answers and claims; concurrent requests are consistent; an acknowledged answer survives a refresh with empty local storage; timers and host controls survive reconnect. Run host plus multiple student browsers, then a teacher-led pilot before advertising classroom availability. Preserve the existing failing uncached-receipt regression until the actual contract supports it.

## Priority 5: trusted progression and content

- Replace client-specified persistent rewards with server-owned, idempotent receipts and a shared-wallet migration plan that accounts for other HSC Science callers. The inspected `credit_coins` function currently accepts arbitrary authenticated credit requests; a cosmetic confirmation state does not fix that exposure. Establish callers, cutover, monitoring and rollback before changing shared grants.
- Treat in-run cash, device-local bests and account-wide Sparks as separate concepts in labels and results. Do not grant persistent currency from the offline demo.
- Build a small reviewed Chemistry set with stable question, course, syllabus/version and outcome identities. An educator approves keys and explanations; automated render and import checks are not scientific review. Show the set's coverage boundary and permit reporting a suspected issue.
- Only graduate additional games and courses after their authority, content, accessibility and playtest gates pass. Keep a teacher-visible correction path and preserve historical answer receipts when questions are revised.

## Delivery order and evidence

1. Implement and playtest the Lab Rush choices, reactions and results locally; capture mobile screenshots and rule-test output.
2. Produce and integrate the smallest coherent art pack; update provenance and compare actual asset sizes.
3. Improve hub availability and card presentation; run the first-impression test.
4. Complete identity, receipt and wallet work in disposable staging; run adversarial, concurrency and reconnect tests before wiring a classroom flagship.
5. Review the bounded Chemistry set, run teacher/student pilots, resolve defects, and repeat for the next course or mode.

Track each item as **implemented**, **verified locally**, **verified in staging** or **validated with users**. A prototype passing locally is not a deployed feature, and a compiled build is not evidence that the game is fun, fair or scientifically correct.
