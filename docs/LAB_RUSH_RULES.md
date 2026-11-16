# Lab Rush offline rules and balance notes

Updated 3 November 2026. This documents the self-contained Chemistry **sample**, not the connected Tycoon economy or an approved HSC question bank. Lab cash and the device-local personal best are not wallet rewards. The sample is not scientifically reviewed.

## Rules

- The Blast Kit starts with 90 seconds and a 30-damage blast. The Time Kit starts with 105 seconds and a 20-damage blast. The clock runs while a question is open and pauses for answer feedback and the shop. An action at or after expiry cannot earn or spend anything.
- A correct answer earns $10 and deals 10 boss damage; it also adds one charge, capped at three. Incorrect answers earn nothing, do no damage and reset the streak. Feedback includes the answer and an optional explanation; the end screen allows review of misses.
- Three charges can be spent on a blast or on 10 extra seconds. At 50 HP or lower, the core is visibly exposed and **blasts** gain 10 damage. The core cannot regenerate, and the phase gives a benefit rather than a hidden penalty. The boss has 100 HP and the run ends on defeat, expiry or an early exit.
- Overclock costs $20 up front for the next answer. A correct answer returns the stake separately, earns double the normal answer cash and adds 10 answer damage; a miss forfeits the stake. Returned stakes do not count as earnings.
- The one-time upgrades are Income Lab ($30, +$8 per correct answer), Attack Bot ($45, +5 damage per correct answer), and Time Reactor ($60, immediately adds 15 seconds). The shop shows current and resulting values. Each can be bought only once. Purchases spend lab cash, not total earned.
- Results show the chosen kit, damage capped to the boss's 100 HP, purchases, a factual highlight, correct answers, best streak and total earned. Replay uses the same kit; Change Kit returns to selection. The personal best is stored only in local browser storage, can be cleared or changed by the browser user, and is not a verified leaderboard.

## Bounds and exploit review

Every correct answer does at least 10 damage, so victory takes at most ten correct answers. Questions repeat after the sample bank ends, but repetition cannot produce unlimited cash in a run: a maximum of ten answers can earn cash. Even the loose upper bound of ten Overclock answers with Income Lab is $360 earned (the income upgrade cannot actually be purchased before the first answer), and returned stakes are not earnings. Wrong answers have no cash reward. There are at most three three-charge conversions and one 15-second time purchase before victory; the largest possible starting-and-earned question-time allowance is therefore 150 seconds with Time Kit. A player can leave feedback or shop open indefinitely because the clock intentionally pauses there, but that does not accrue cash or charge. A player can alter the offline code or local storage, so these bounds are gameplay properties, not anti-cheat guarantees.

## Deterministic balance model

Run `node scripts/lab-rush-balance.mjs` for the reproducible table. This intentionally simplified independent planning model uses fixed 6, 12 or 18 seconds of active question time, either all correct or a repeating correct/correct/miss pattern. It buys one chosen upgrade immediately when affordable, ignores question reading variability and pauses, and **does not use charge, blasts, Overclock or multiple upgrades**. It is useful for finding thresholds, not a prediction of real player outcomes or a substitute for testing the game.

Examples with every answer correct:

- At 6 seconds per answer, either kit defeats the boss with ten answers and $100 earned without an upgrade. Income Lab yields $156 on the same ten answers; Attack Bot reduces the victory to nine answers and $90. Time Reactor adds time but does not change that fast player's outcome.
- At 12 seconds, Blast Kit without an upgrade lands seven correct answers before the clock ends; buying Time Reactor after six permits eight. Time Kit without an upgrade lands eight; with the reactor it lands nine. Income Lab improves earnings but does not itself change damage or available time. Attack Bot improves boss damage without changing available time.
- At 18 seconds, Blast Kit without an upgrade lands four answers and cannot afford Attack Bot or Time Reactor before expiry; Time Kit lands five. This indicates that the pricier upgrades can feel unreachable to slower players unless charge, Overclock, a different purchase order or improved accuracy changes the run.

The model makes Blast Kit appear worse because it deliberately omits blasts. With actual rules, saving three charge until six correct answers leaves the boss at 40 HP: an exposed Blast Kit blast deals 40 and wins immediately, while the Time Kit blast deals 30 and leaves 10 HP. Conversely, Time Kit gives more time for difficult questions and can spend charge on an extension. No upgrade is universally superior across earning, damage and time objectives, although the Time Reactor has no value when a player already has enough time to win, and attack can reduce total cash by ending the run sooner. These tradeoffs are theoretical; they do not establish that any choice feels balanced or fun.

## Verification and next evidence

`node --test tests/offline/lab-rush-demo.test.mjs` exercises the generated actual demo, including kit timers, both blast strengths, upgrades, Overclock, exposed-core effect, expiry, stale controls, results and replay. The optional Chromium smoke in `tests/browser/lab-rush.smoke.mjs` checks actual UI interactions and layout; it also checks Campaign and therefore requires a configured preview server. Separate 320px browser checks have exercised the exposed phase, shop, results and keyboard replay. These are functional checks, not a classroom playtest. Test mixed accuracy, question reading time, real mobile devices and player understanding before tuning costs or claiming balance.
