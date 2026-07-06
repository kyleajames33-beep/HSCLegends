# Heist Redesign — "The Break-In"

Status: **design + working vertical slice** (2026-07-06). Replaces the old "every 4th round
auto-steals" rule with an interactive raid/defend layer on top of the same quiz engine,
same Supabase multiplayer infra, same rooms/teams/clock.

---

## 1. The problem this fixes

Every mode in the app — old Heist included — had one real decision: *answer the multiple-choice
question correctly*. The "steal" was a scoring rule (correct on round 4/8/12 → server moves gold)
plus a toast. No targeting, no defending, no timing, no positioning. Two equally good quizzers
produced an identical game every time.

**Design goal:** the quiz stays the engine (it's HSC revision — that's the product), but correct
answers *earn the right to act*, and the acting is a genuine interactive game with decisions that
matter even between quiz-equal players.

**Platform:** classroom laptops. Schools ban phones, so this mode deliberately uses full
mouse + keyboard — WASD movement, mouse-dragged defense, click placement, Space-hold channels.
There is no touch fallback and there won't be one.

## 2. The core mechanic

Two teams (Crimson / Violet), each with a **vault** — a top-down floor of 3 rooms guarded by
sweeping **lasers** (house security, always on) and player-placed **sentries**. The vault's gold
balance *is* the team's score, and it is physically raidable.

Answering questions earns two currencies:

| Earn | Who gets it | What it does |
|---|---|---|
| **Gold** (+50–100, speed-scaled) | your team's vault | score — and the thing the enemy can steal |
| **Energy** (+20–30 correct, +5 wrong) | you personally | fuel for every interactive verb below |

Three verbs to spend on — this is where the game lives:

### 🥷 RAID (60⚡) — attack, in person
You leave the quiz and drop into the *enemy* vault as a thief (WASD). Work inward through
3 rooms: dodge the laser sweeps, path around their sentries, stand on a gold pad and **hold
Space** to crack it. Each room's pad is worth a % of the *victim's current vault*
(10% → 15% → 20%, so a full clear lifts 45%) — and each room deeper is faster lasers and a
longer walk home. Escape back out the entry hatch to bank what you carry.
**Get caught — laser, sentry, or spotlight — and you bank nothing AND your team's vault pays
a 20g penalty to theirs.** Raiding is push-your-luck with real downside, not free EV.

### ⚡ SENTRY (30⚡) — defense, placement
Click a spot on *your own* floor to install a sentry (max 6 live per team, single-use — it's
spent on the thief it catches). Sentries are **visible to raiders**: they don't ambush, they
*zone*. Good players put them in doorways and on pad approaches; that's a spatial decision the
quiz never asks.

### 🔦 SPOTLIGHT — defense, active (free, but you stop answering)
When a raid starts, the victim team's screens flash **INTRUDER ALARM**. Any defender can jump
to the security console: your quiz pane is replaced by your vault floor, and you drag a
spotlight beam with the mouse. Hold the beam on the intruder to fill a 1.2s detection meter →
caught. The catcher gets personal gold + the team penalty. While you're on the console **you
earn nothing** — sacrificing income to defend is the game's sharpest decision.

### Why these decisions are real (independent of quiz skill)

- **When to strike:** the enemy's crew answers on the same synced clock you do. Raid while
  they're heads-down mid-question and nobody's free to man the spotlight. (The UI shows the
  round timer — *everyone's* round timer — so timing reads are possible.)
- **How deep to push:** leave after room 1 with a safe 10%, or go for the 45% full clear with
  slower movement (carrying loot slows you) and faster lasers.
- **Attack vs defense:** 60⚡ is a raid or two sentries. Teams that never defend bleed;
  teams that never raid can't come back.
- **Where to zone:** sentry placement is pure spatial play; door chokes vs pad camps.
- **Answer or defend:** the alarm interrupts *your* study flow. Someone has to eat that cost.
- **Catch-up is built in:** loot is a % of the victim's vault, so the rich team is the juicy
  target and robbing the poor team pays pennies. Wrong answers still trickle +5 energy, so the
  weakest quizzer in the class still gets to raid — and raiding well is a different skill.

## 3. Moment-to-moment loop

A match is ~12 questions × 18s (~4 min) on the existing self-driving clock:

1. Question drops (whole room, synced). Answer with mouse or keys **1–4**. Correct → vault
   gold + energy; the energy bar visibly climbs toward the 60⚡ RAID line.
2. Between answers you make one call: bank another answer, drop a sentry, or **GO** —
   hit RAID and the right-hand board becomes the enemy vault.
3. Raids are ~15–40s of pure play (you miss 1–2 questions — that's the price). Alarm fires on
   enemy screens; maybe someone jumps to the spotlight, maybe they're mid-question and can't
   afford to.
4. Result lands as an event both teams see: `💰 NAME escaped with 84g!` or
   `🚨 NAME was caught by NAME — +20g penalty!` (Juice Kit: flash/shake/burst on both sides.)
5. Last question ends it: most vault gold wins; XP pays out as before; the match feeds the
   season leaderboard (below).

## 4. Multiplayer architecture — 3 layers on the existing infra

Everything reuses the working Supabase stack (presence, heartbeat, drop-recovery, self-driving
clock, `postgres_changes`). One new primitive: **Realtime broadcast** for ephemeral action data.

| Layer | What | Transport | Authority |
|---|---|---|---|
| **Engine** (existing) | rounds, questions, clock, teams, vault balances | `heist_rooms`/`heist_players` rows + `postgres_changes` | Postgres RPCs |
| **Economy** (new) | energy, raid lifecycle, sentries, loot transfer, penalties | new RPCs: `heist_raid_start/end`, `heist_place_trap`, `heist_me`; `heist_raids` table added to the realtime publication (= the alarm signal) | Postgres RPCs — server validates costs, cooldowns, loot caps, min raid duration |
| **Action** (new) | raider position, spotlight position, detection % | `sb.channel('heist-live:{room}')` **broadcast** at ≤10Hz — never touches the DB | raider's client (see trust model) |

**Latency design:** nothing skill-based depends on server round-trips. Lasers are deterministic
functions of wall-clock time (all clients compute the same sweep locally). Sentries are a static
snapshot taken at raid start. The only live human-vs-human interaction — spotlight vs raider —
uses a *cumulative* 1.2s detection meter with decay, which is forgiving of 200–400ms broadcast
delay. Spectator views of a raid are cosmetic and may lag; the raider's own view is the one that
resolves.

**Trust model (deliberate, documented):** the raider's client detects its own hits (laser /
sentry / spotlight) and reports the outcome; the server independently enforces everything
economic — energy cost, one active raid per player, ≤3 concurrent raids per target, an 8s
re-raid cooldown, loot clamped to the pad percentages of the *current* vault, a minimum elapsed
time per room looted (no teleport-grabs), and a 50s hard expiry. A determined cheater with
devtools could dodge a catch; they cannot mint gold or skip the economy. That's the right
trade for a classroom game on Supabase — flagged as future work, not an accident.

**Drop mid-raid:** heartbeat/rejoin already restore the player; an abandoned raid row expires
server-side (any later `raid_start/end` sweeps it), the alarm clears, no gold moves.

## 5. Numbers (first-pass tuning, all in one place server-side)

| Knob | Value |
|---|---|
| Correct answer | +50–100g vault (speed-scaled), +20–30⚡ (speed-scaled) |
| Wrong answer | +5⚡ (inclusivity trickle) |
| Energy cap | 100⚡ |
| Raid cost / Sentry cost | 60⚡ / 30⚡ |
| Pad loot (room 1/2/3) | 10% / 15% / 20% of victim vault (min 5g each) |
| Caught penalty | 20g vault→vault + catcher gets +20 personal gold |
| Concurrent raids per target / per player | 3 / 1 (8s cooldown after a raid ends) |
| Raid hard cap | 50s (server-expired) |
| Live sentries per team | 6 (single-use) |
| Spotlight | radius 8u, catch = 1.2s cumulative overlap, decay when off-target |
| Question pace | 18s × 12 questions |

## 6. Persistent competition layer

Kyle wants live multiplayer **and** ranking. Two tiers:

- **In-match** (exists): `heist_players.gold` is personal contribution (income + loot banked +
  catch bounties) → end-of-match "Top crew" list; new `stolen` / `catches` columns make the
  results screen tell the story ("stole 210g · 2 catches").
- **Season board** (new, shipped in slice): when a match finishes, `heist_advance` logs one
  `heist_match_log` row per signed-in player (win, gold, stolen, catches).
  `heist_leaderboard(p_days)` ranks the season's **Master Thieves** (most gold stolen), with
  games/wins/catches alongside. Surfaced on the finished screen. Upgrade path: join
  profiles/avatars (Foundation D pattern), add an ELO/divisions track like Duel's, seasonal
  soft-reset aligned to the existing `seasons` table.

## 7. Vertical slice — in / out

**In (this build):** energy economy in `heist_submit`; full raid lifecycle (RPCs + board +
WASD + lasers + pads + escape/bank); sentry placement; spotlight defense with live intruder
broadcast; alarm via realtime on `heist_raids`; caught penalties + catch credit; keyboard
answering (1–4); match log + season leaderboard RPC + finished-screen board; Juice Kit wiring;
placeholder SVG art (shapes only — real sprites drop into the same SVG slots later).

**Out (deliberate):** sound; spectator polish (teammate raid-cam is best-effort broadcast
rendering); anti-cheat beyond economic clamps; mid-raid sentry placement (snapshot at raid
start — a sentry placed during an alarm arms for the *next* raid, so raiders never die to an
invisible object); 4-team variant; hidden-trap variant; art.

## 8. Extension contract — the interactive-laptop mode pattern

This is the template for the next modes (the classroom "Blooket-killer" first). Reuse the
three-layer split; a new mode swaps the *board* and the *verbs*, not the plumbing.

### 8.1 The layer split (copy this)
1. **Engine — synced quiz rounds.** One room row with `round`, `round_started_at`,
   `per_q_seconds`; every client runs the same 500ms interval that fires `*_start` / `*_advance`
   when deadlines pass (self-driving clock — no host process). Questions are the only income
   source. *Never* let the interactive layer mint score directly; it may only move/multiply
   what questions earned. That's what keeps study time the dominant strategy.
2. **Economy — server-authoritative verbs.** Each interactive verb = one RPC that (a) checks the
   room is active, (b) checks + deducts a per-player resource earned in `*_submit`, (c) enforces
   caps/cooldowns/clamps, (d) writes rows that `postgres_changes` fans out. The RPC is the
   anti-cheat boundary: clients can lie about *aim*, never about *cost or payout*.
3. **Action — ephemeral broadcast.** One channel per room: `sb.channel('<mode>-live:{room}')`,
   `.send({ type: 'broadcast', event, payload })`, throttled to ≤10Hz per sender. Positions,
   cursors, aim, meters — anything that's worthless 2 seconds later. Never persist it. Big
   fan-out (a whole class broadcasting) needs sender-count discipline: design so only a few
   players are "live actors" at once (here: raiders + console defenders), not all 40.

### 8.2 Latency rules (what makes it feel good on school wifi)
- **Deterministic hazards:** anything that must look synced everywhere (laser sweeps, moving
  obstacles) is a pure function of wall-clock time — zero sync traffic, zero drift that matters.
- **Snapshot the opponent's static layer** (sentries/walls/loadout) at action start; don't
  stream it.
- **Human-vs-human contests use accumulation, not instants:** capture meters over ~1s, zones
  not hitscan, generous radii. A 300ms-late spotlight still catches; a 300ms-late headshot
  whiffs — so no headshots.
- **One client owns each contest's resolution** (here: the raider). Pick the client whose
  experience matters most, let it judge, let the server clamp the stakes.

### 8.3 Input model (laptop-native)
- Movement: `keydown`/`keyup` into a pressed-keys set, integrated in a single `requestAnimationFrame`
  loop (WASD + arrows); board is a normalized 100×100 space rendered as SVG (art-swappable).
- Aim/placement: pointer events on the board, same normalized coords.
- Quiz never loses the keyboard: 1–4 answer keys; interactive verbs must not steal focus from
  answering (the board only captures keys while you're *in* a run).
- Every mode ships a mode switch: `quiz | acting | defending` — the quiz pane is always the
  default and the fallback.

### 8.4 Robustness (already built, just wire it)
`startHeartbeat` + `saveArenaSession`/`heist_rejoin`-style recovery + presence-filtered player
counts, per `docs/LIVE_ROBUSTNESS.md`. Interactive additions must be abandonment-safe: every
action row gets a server-side expiry and every RPC sweeps expired rows, so a closed laptop lid
never wedges a match.

### 8.5 Meta layer
On finish (inside the existing single-shot finish branch of `*_advance`): write a per-player
match-log row keyed by `user_id`, and expose a season leaderboard RPC over it. XP keeps flowing
through `xp_events` as before.

---

## 9. File map (slice)

- `supabase/migrations/20260706_heist_breakin.sql` — schema + RPCs (applied to live).
- `lib/heist.ts` — new client bindings: `heistMe`, `heistRaidStart/End`, `heistPlaceTrap`,
  `heistTraps`, `heistLeaderboard`, `joinHeistLive` (broadcast channel helper).
- `app/heist/page.tsx` — two-pane active screen (quiz + vault board), raid engine
  (rAF/WASD/lasers/pads), sentry placement, spotlight console, alarm/result events.
- Board geometry constants live in `lib/heist.ts` (`HEIST_BOARD`) and are mirrored in the
  SQL loot/placement validation.
