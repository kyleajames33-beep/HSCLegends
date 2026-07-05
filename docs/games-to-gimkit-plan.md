# Games → Gimkit Level — Comprehensive Improvement Plan

Status: **plan for review, then execute.** Goal: bring every non-Campaign game mode up to a
Gimkit-quality experience. Grounded in a code-level analysis of each mode (2026-06-16).
Campaign is already done (it's the reference for "what good looks like" here).

> **Correction to note:** an analysis pass wrongly flagged "Heist has no backend." Verified false —
> `heist_rooms`/`heist_players` tables + 8 `heist_*` RPCs exist in the DB (they're just not in repo
> migrations, like all our RPCs). Heist is fully functional.

---

## The bar: what "Gimkit level" means
A mode is Gimkit-level when it has all five:
1. **A distinct core loop** that's fun even before the questions (a *game*, not a quiz skin).
2. **An in-game economy / strategy choice** — answering earns something you *spend* on meaningful choices (the Campaign energy→action model is our proven template).
3. **Strong juice** — every action has kinetic feedback (particles, floats, shake, urgency, sound).
4. **Smooth, robust multiplayer** (where live) — presence, late-join, drop recovery, live leaderboard.
5. **Meta-progression** — PBs, per-mode leaderboards, seasons/ELO, cosmetics.

Current scorecard (rough Gimkit parity):
| Mode | Core loop | Economy | Juice | Multiplayer | Meta | ~Parity |
|---|---|---|---|---|---|---|
| Campaign | ✅ | ✅ | ✅ | n/a (solo) | ✅ | ~90% (done) |
| Quick Game / Daily | ✅ | ⚠️ earn-only | ✅ good | n/a | ⚠️ league only | ~55% |
| Match | ⚠️ reflex only | ❌ | ⚠️ | n/a | ❌ | ~30% |
| Heist | ✅ team steal | ❌ | ⚠️ mute steals | ✅ realtime | ❌ | ~45% |
| Knockout | ✅ battle royale | ⚠️ thin | ✅ ok | ✅ realtime | ❌ | ~50% |
| Duel | ⚠️ feels like 2 solo quizzes | ❌ | ⚠️ | ❌ async/polled | ⚠️ ELO, no tiers | ~35% |
| Live Class (host/join) | ✅ | ❌ | ⚠️ | ✅ realtime | n/a | ~50% |

---

## Strategy: build the foundations once, reuse everywhere
The analysis shows the SAME gaps recur across modes. Highest leverage is to build shared pieces,
then wire each mode to them — instead of bespoke work per mode.

### Foundation A — **Juice Kit** (shared component/util)
Generalise the Campaign combat FX into reusable primitives: floating numbers, particle burst on
correct, streak-flame pop, timer-urgency (bar goes red), screen flash/shake, count-ups. One module,
imported by every mode. *(Campaign already has 80% of this — extract it.)*

### Foundation B — **In-game economy pattern** ("earn → spend")
The Campaign's energy→action loop is the template. Each mode gets a small spend layer: answering
charges a resource, you spend it on a mode-appropriate choice (steal/defend, powerup, double, shield).
This is THE thing that turns "quiz skin" into "game."

### Foundation C — **Live-game robustness** (heist/knockout/live class)
- **Presence/heartbeat**: drop players who disconnect (today they linger in counts).
- **Late-join window**: join an in-progress game (catch-up).
- **Drop recovery**: rejoin by id and restore score/state.
- **Live leaderboard** during play (not just at the end).
These are shared concerns; build a small presence + leaderboard helper used by all three.

### Foundation D — **Per-mode leaderboards + PBs**
We just built the Campaign speed-leaderboard pattern (table + record RPC + leaderboard RPC + opt-in
name/avatar join). Reuse it for Match (fastest), Quick Game (weekly score), Knockout/Duel (ELO).

---

## Per-mode plans (prioritised)

### 1. Quick Game / Daily  — *the wedge; highest traffic*
Current: 10 Qs → score → Sparks/XP/streak; power-ups are fire-and-forget; earn-only (no spend).
- **[medium] Earn→spend session** — answering fills an Energy meter; spend mid-run on a choice
  (e.g. "bank" vs "risk double", or a board upgrade). Closes the #1 gap (design doc §2).
- **[medium] Weekly score leaderboard + PB** — "You're #47 / 200 · 15 XP from #46" on results.
- **[small] Juice**: streak-flame pop, correct-answer particle burst, wrong-answer shake.
- **[medium] Power-up rebalance** — earn power-ups from streaks; make the spend a real choice.

### 2. Match (speed pairs) — *thinnest; needs the most*
Current: tap-to-pair 5, +2s penalty on miss, Sparks on finish. Pure reflex, no study integration.
- **[large] Integrate the question** — tapping a pair pops a 2-option mini-question; correct locks it,
  wrong = penalty. Turns a memory game into a *study* game (Blooket-style). Biggest single upgrade.
- **[medium] Leaderboard + PB** (fastest time per subject) — the core replayability lever.
- **[medium] Difficulty modes** — Blitz (10 pairs, 1 mistake = fail) for bigger rewards.
- **[small] Feedback**: "+2s" penalty popup + shake, timer urgency colour, match count-up.

### 3. Heist (team steal) — *backend exists; loop is mute*
Current: answer = bank gold; heist rounds steal from the other team. Steals are visually silent.
- **[small] Steal feedback** — "💀 Robbed for 50g!" toast to the victim team + "💰 Stole 50g!" to yours;
  a steal animation on the gold bar (it currently changes silently).
- **[medium] Risk choice on heist rounds** — "Go for it" (steal, but −pts if wrong) vs "Play safe"
  (small guaranteed bank). The missing strategy layer.
- **[medium] Catch-up / heist-phase swings** — periodic forced heist rounds; bigger swings when a team
  is far behind (keeps it dramatic, not a runaway).
- **[medium] Team emotes / "push now!" pings** — light social layer.

### 4. Knockout (battle royale) — *closest to good; needs meta + callouts*
Current: elimination on wrong (if anyone's right), speed-scored, "lucky rounds", XP scaling. Solid.
- **[medium] Powerups/loadout** — one-use Shield / Double / Freeze / Revive drawn per game → swing moments.
- **[small] Elimination callouts** — "💀 Alice & Bob are out — 3 left!" to everyone (not just the eliminated).
- **[medium] Live leaderboard ticker** during play + survivor spotlight.
- **[large] Season ELO ladder** (`/leaderboard/knockout`) — weekly rating, soft-reset.

### 5. Duel (1v1) — *async by design; make the ghost feel alive*
Current: async "ghost" duel (find-or-create, answer your 5, result when opponent finishes) — RPC-only,
no realtime. The async model is intentional (no need for both online), so don't force realtime —
make the ghost *feel* like an opponent.
- **[medium] Live ghost pace** — show the opponent's answer-by-answer progress/score as a racing bar
  ("they're on Q3 · 2 correct") replayed against your clock.
- **[medium] Pending timeout / concession** — if no opponent in N min, resolve vs a bot-ghost or let you
  concede; kill the "pending forever" limbo.
- **[medium] Speed bonus** — fastest correct earns more; show "+X speed!".
- **[large] ELO divisions** — Copper→Diamond tiers with promotion + seasonal reset (DB already has ELO).
- **[large] Power-ups** — 50/50, Skip, Double as a pre-duel loadout.

### 6. Live Class Game (host/join) — *the classroom flagship*
Current: host hosts, students join by code, realtime questions + scoreboard, auto-advance, double-points.
- **[small] Host answer-count** — "18/30 answered · 12 correct" on the projector (urgency + insight).
- **[medium] Late-join window** — students can join an in-progress game.
- **[medium] Team mode** — students pick a team; team scores aggregate (louder, more social).
- **[medium] Review phase** — between/after questions, show the correct answer for discussion.
- **[medium] Drop recovery** — rejoin restores score (no "I refreshed and lost everything").
- **[small] Live leaderboard** on student phones between questions.

---

## Recommended execution roadmap
Foundations first (they unblock multiple modes), then mode-by-mode, highest-traffic first.

- **Phase 1 — Foundations:** extract the **Juice Kit** (A) + the **live-game presence/late-join/leaderboard helper** (C) + reuse the **leaderboard pattern** (D). ~unblocks every mode.
- **Phase 2 — Quick Game** (highest traffic, the wedge): earn→spend session + weekly leaderboard + juice.
- **Phase 3 — Knockout**: powerups + callouts + live ticker (it's closest to great).
- **Phase 4 — Heist**: steal feedback + risk choice + swings.
- **Phase 5 — Live Class**: answer-count + late-join + team mode (the classroom seller).
- **Phase 6 — Duel**: live ghost pace + concession + ELO tiers.
- **Phase 7 — Match**: integrate the question (turn it into a study game) + leaderboard.
- **Cross-cutting later:** season/ELO ladders, sound FX (Web Audio), cosmetics.

Each phase is independently shippable and testable. Suggest building + you testing one phase at a time.

---

## Progress log
- **2026-07-05 — Foundations A + C shipped (browser- and multi-client-verified):**
  - **Foundation A — Juice Kit** ([`components/juice.tsx`](../components/juice.tsx), docs: [`JUICE_KIT.md`](./JUICE_KIT.md)):
    floats, particle burst, escalating streak-flame, timer-urgency bar, flash/shake/haptics —
    extracted from Campaign (Campaign untouched) and wired into **Quick Game** + **Knockout**.
    Note: the doc's "Campaign has 80% of this" oversold it — particle burst and flame
    *escalation* didn't exist anywhere and were built new.
  - **Foundation C — presence / late-join / drop recovery** for Knockout, Heist, Live Class
    (migration `20260705_arena_robustness.sql` applied to live; docs: [`LIVE_ROBUSTNESS.md`](./LIVE_ROBUSTNESS.md)).
    15-assertion REST simulation + Playwright multi-context browser test all green.
  - **Bug found & fixed:** `ko_advance`'s shield clause NULL-trapped — any player holding an
    *unused* shield was immortal. Caught by the 3-client browser simulation, regression-tested.
  - ⬜ real-device pass still needed (locked-phone heartbeat timing, classroom wifi).

- **2026-06-16 — Phase 1 + Quick Game (safe wins) shipped:**
  - Foundation A: **wrong-answer shake** on the shared AnswerTile (every mode benefits).
  - Quick Game: **combo system** (streak builds → 3+ combo earns bonus Sparks → "best streak" payoff
    on results) + **weekly rank nudge** ("🏆 #N in <subject> this week · X pts to #N-1"). Both additive,
    0 new lint errors.
  - **DEFERRED — Quick Game earn→spend Energy session:** it's the headline gap but touches the core
    play loop + the Sparks reward economy. Building it blind (untested) on the highest-traffic mode is
    the riskiest item in the plan — best done once Kyle can test.
  - **Remaining modes (Knockout/Heist/Live/Duel/Match):** most high-value changes need server-side
    gameplay changes (new RPC params, presence, leaderboard data) on the *live multiplayer* modes —
    also better validated with a real test than built blind.
