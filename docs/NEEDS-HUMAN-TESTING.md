# Needs a Human — HSC Legends

Running log of things that need Kyle (a real human, real devices, or a design decision).
Maintained by Claude during autonomous sessions. Last updated: 2026-06-14.

North star: **make studying as addictive as a game** (engagement-first edu app). The quiz
engine is the core; game mechanics serve retention. Not building a standalone strategy game.

---

## 🔴 Needs human testing (can't verify without real auth / two devices / eyes)

1. **Two-device live game (host + join)** — ✅ realtime VERIFIED (2026-06-14).
   - ✅ All 6 realtime tables ARE published (`game_players`, `game_sessions`, `heist_*`, `ko_*`) —
     the #1 silent-killer is ruled out.
   - ✅ Kyle hosted a game and it works. (Detailed test memory also shows two-device host+join was
     verified earlier.)
   - ◻️ Nice-to-confirm final tick: a full round with a 2nd real player (incognito or phone) end to
     end — questions sync, scoreboard updates live, game ends cleanly, and `claim_game_xp` writes
     back when signed in.

2. **XP write-back actually persists** — verified the SQL fires (`record_quick_game` /
   `record_daily_quiz` award XP + advance streak), but the real signed-in client path
   (auth + RLS) has not been confirmed. Sign in, finish a quiz, confirm `total_xp` rises and
   the streak advances on the home/profile screens.

3. **Email / OTP login** — sign-in flow never tested end-to-end.

4. **NEW reward feedback + juice (added this session)** — after a signed-in quiz, the results
   card now: pops in (`lg-pop`), **counts up** XP and Sparks (0→value), and shows
   `💥 Dealt N damage to the <subject> boss →`.
   - ✅ CHECK (visual): the card animates in and the numbers count up smoothly (not janky); the
     boss line links to `/boss` and `/boss` HP actually dropped by N.
   - Juice pass now COMPLETE (Duolingo-subtle): results count-up + pop, win-screen pops on
     duel/heist/knockout/match, and a **correct-answer bounce on every AnswerTile** (all modes).
   - ✅ CHECK (visual): answer a question correctly → the tile gives a quick bounce; win any mode
     → the result emoji pops in. Confirm it feels good, not janky, on phone + desktop.
   - Still in addictive-loop-design.md §4 for later (need design judgement): streak-flame pop,
     league-up celebration, boss-hit kinetic, near-miss "X XP from #N" nudge.

5. **Responsive / fullscreen pass (this session)** — visually QA all 26 routes on a maximized
   desktop window AND a phone. Do ONE hard refresh (Ctrl+Shift+R) first to drop the old
   service worker. Spot-check: home dashboard (2-col), a quiz (wide 2×2 grid), heist/knockout
   backgrounds bleed full-screen, login/welcome/share stay nicely centered.

6. **Recently-added pages** (campaign, match, collection, league, rewards, achievements,
   profile, progress, topics, review, exam) — functional testing of each; this session only
   touched their layout widths, not their logic.

---

## 🟠 Needs a human decision / design judgement

➡️ **Concrete proposals now written in [addictive-loop-design.md](addictive-loop-design.md)** —
each section there has a "DECISIONS NEEDED" list. Approve/edit those and I can build.

1. **Energy → modes meta-game loop** (parked). Direction chosen: quiz performance earns
   energy/currency spent in existing modes. → Spec'd in design doc §1–2. Decide: distinct Energy
   vs reuse Sparks; which modes get the explicit earn→spend phase first (recommend Heist + Boss).

2. **CoC-style persistent meta-game** (long-term hook). → Spec'd in design doc §3 (maps onto
   existing classes/league/collection). Decide: build it at all; if so, HQ-only MVP vs include raids.

3. **Juice / animation pass** on reward moments. → Specific list in design doc §4. Decide: approve
   the list, and pick intensity (subtle Duolingo vs loud Blooket). Then I implement.

4. **Live "team mode" (Kahoot/Gimkit-style).** ✅ **Option (a) SHIPPED** (host-display only — safe, zero
   server/player change; see the host section below). Still optional later: **(b) full team mode** — a nullable
   `team` column + team pick on join + players seeing their own team/score. That one touches the *verified* live
   flow and needs a 2nd device to test, so do it only when you can sit with me for a live two-device run. → Want
   (b) eventually, or is the host-display version enough?

---

## 🟡 Audit findings to review (found in code; need a decision, not yet changed)

1. **Sparks farming — FIXED (verify).** `app/play/page.tsx` `save()` now only credits Sparks +
   advances the daily quest when the round actually counts (`earns = r.counted` for daily; quick
   games always count). The results screen also only shows "+Sparks" when credited.
   - ✅ CHECK: replay a daily quiz you've already done today → should show "doesn't re-count",
     **no** "+Sparks" line, and the Sparks balance must NOT increase.
   - ✅ CHECK: a fresh daily and any free-practice (quick) game → Sparks DO increase as before.
   - ⚠️ Open: quick "free practice" games still always reward XP/Sparks/boss-damage with no daily
     cap — confirm that's intended (practice should be rewarded) and not also farmable.

2. **Weekly Boss balance.** Boss has 500 HP shared by the whole class (resets Monday). A solo
   player barely moves the bar — intended as a collective raid, but confirm that's the design
   intent and that it reads that way to students.

3. **Pre-existing lint errors** (not from this session): several pages have
   `react-hooks/set-state-in-effect` / `react-hooks/purity` (e.g. `play`, `match`, `collection`,
   `rewards`). Non-blocking but worth a cleanup pass.

---

## 🔵🔵 Campaign BATTLE v3 (current — supersedes the v1/v2 notes below)

Full rebuild of `/campaign` into a Teaching-APP-style action battle. Test at the end:
- **Pick your fighter** on the map (Adventurer / Explorer / Robot / Zombie) — a real toon character
  that idles, **winds up to attack**, and recoils when hurt. Choice saved in localStorage.
- **Answering only earns Energy** (⚡) now — no auto-attack. Correct = +Energy (+combo, +bonus if fast).
  Wrong / **timeout** = the boss strikes you.
- **Timed questions** with a draining bar; **auto-advances** (no Next button).
- **Action bar**: ⚔️ Hit (1⚡, ×1.5 at 3-combo, **CRIT ×2 at 5-combo**) · 💥 Special (3⚡) · 🛡️ Block (1⚡,
  heal+shield). You only damage the boss when you choose an action.
- **HP resets every game; only the UNLOCK persists** — new server fn `campaign_defeat` advances the
  stage + awards `50+stage*25` Sparks on a win (migration `campaign_defeat_unlock` applied to prod).
- **Boss changes pose** (attack/hurt frames), **intro title card**, **low-HP red vignette**, **haptics**.
- **Boss enrage** — under 40% HP it shows 😤 ENRAGED and hits 50% harder.
- **Boss telegraph** — every 3rd question it shows "⚡ charging a big hit — BLOCK!"; tap 🛡️ Block to
  negate it, or eat a −30 HP charge. Makes Block strategic.
- **Victory** reward counts up; dark **arena background** behind the fight.
- ◻️ Remaining: real arena art (drop into bg slot), sound FX (deferred — no audio API yet).

**Campaign meta + Weekly Boss polish (latest):**
- **Pathway map** — the campaign list is now a winding **journey** (zigzag nodes on a dashed trail,
  stage badges, ⭐ cleared count). ✅ CHECK: nodes tap into the right boss; reflects stage/clears.
- **Loot on defeat** — beating a boss now drops a **free Legend card** (new `campaign_loot` server fn,
  migration `campaign_loot_card`; better-than-pack odds, no Sparks cost). Shows in the victory screen
  with rarity frame; dupes refund Sparks. ✅ CHECK: win → a card appears + lands in `/collection`.
- **Weekly Boss** — bigger boss + **count-up** on your-damage / students-fighting stats. (It's a
  *collective* boss — you chip shared HP via quizzes — so it stays a rally arena, not a personal duel.)
- **Boss lore (#14)** — each campaign boss now has a **name + title + taunts** (The Mitochondrion
  Monarch, The Catalyst, The Singularity, …). Shows on intro card, HP bar, pathway map; the boss
  taunts you when it charges. (`lib/boss-lore.ts` — pure client flavour.)
- **Speed-clear leaderboard (#20)** — battles are timed; on a win your clear time is recorded
  (`campaign_clears` table + `campaign_record_clear` / `campaign_leaderboard` RPCs, migration
  `campaign_speed_leaderboard`) and the victory screen shows your time + the **fastest clears** for
  that subject (opted-in players only, same as other leaderboards).
  - ✅ CHECK: win a boss → "⏱ Cleared in Ns" + a top-5 fastest list (you highlighted if opted in).
- ✅ CHECKS: answering charges Energy but does NOT hurt the boss; only Hit/Special/Block do. Win → next
  stage unlocks + Sparks; leave & re-enter → boss HP is **full again** (doesn't persist). Knockout → retry.
  Timer runs out → counts as a miss. Fighter choice persists across reloads.
- ⚖️ Tunables in `app/campaign/page.tsx`: PLAYER_HIT, QUESTION_TIME, HIT/SPECIAL_DMG, costs, MAX_AP.
- ◻️ Still to do: battle **background/arena art**, victory sequence polish, sound FX.

---

## 🔵 (older) Campaign energy battle v1/v2 — superseded by v3 above

`/campaign` now has the "energy → spend" game feel (first slice of the approved meta-game loop),
client-side only — server boss HP / stage progression untouched:
- **You have HP too.** A wrong answer = the boss strikes back (−16 HP). Correct = combo + Energy.
- **Energy (AP) orbs** fill on correct answers (+1, or +2 at a 3+ combo, max 3).
- **⚡ Focus** (when Energy full): heal +30 + shield the next hit.
- **Knocked out** (HP→0): "Retry battle" screen; boss damage you dealt is already saved server-side.

✅ CHECKS (sign in → `/campaign` → enter a boss):
- Get questions wrong on purpose → your green HP bar drops, "boss strikes back" shows; at 0 HP you
  get the knock-out screen and "Retry battle" re-enters with the boss HP you'd already chipped down.
- Answer 3 correct in a row → 🔥 combo shows, Energy orbs fill, **⚡ Focus** enables → tap it →
  you heal + a 🛡️ appears → next wrong answer is "Blocked — no damage".
- Defeating the boss still awards Sparks + advances the stage as before (server unchanged).
- ⚖️ Balance to feel out: −16 HP/wrong, +30 Focus heal, 3-AP cost — tune in `app/campaign/page.tsx`
  constants (`PLAYER_HIT`, `MAX_AP`, the heal amount).

**Combat juice upgrade (added — makes it feel like a fight, not a quiz-with-a-pic):**
- **Your avatar character** (the one you design at `/avatar`) now fights on your side; it lunges when
  you attack and shakes when hit.
- **Boss moves**: shakes when you hit it, lunges down at you when it attacks.
- **Screen flash** (gold = you hit, red = you got hit, blue = shield) + **screen shake** on damage.
- **Floating damage numbers** over whoever got hit.
- **⚔️ Power strike** (offensive special, NOW added): spend a full Energy bar → 3-strike nuke with a
  gold flash + screen shake. Persists server-side (calls the attack RPC 3×). **🛡️ Focus** = defensive.
- ✅ CHECK: hits flash/shake the screen, numbers float, both characters animate; Power strike chunks
  the boss HP and the drop persists if you leave + re-enter.
- ◻️ NOT done yet (your list): a per-question **countdown timer**, a **battle background** (waiting on
  generated art via the bg-slot), and a true sprite-animated fighter (avatar lunges but has no custom
  attack frames — that needs character art). All noted for next.

## 🏛️ NEW MODE — Research HQ (`/hq`) — Clash-of-Clans-style idle base
Persistent base, self-contained Sparks sink+faucet (server: `user_base` table + `get_base` /
`base_collect` / `base_upgrade`, migration `research_hq_base`). On the home screen + an **HqChip**
nudge on home shows "X ✨ ready to collect" when the Reactor has accrued (the idle "come back" hook).
- **Reactor** ⚛️ generates Sparks/hr (up to the **Vault** cap) → Collect. **Lab** 🔬 speeds up upgrades.
  Upgrades cost Sparks + take real time (timers); auto-finish on return.
- ✅ CHECKS: collect adds Sparks (wallet rises); upgrades charge Sparks, show a countdown, and
  level up when done; Vault cap limits accrual; "not enough Sparks" blocks an upgrade you can't afford.

## ⚡ Quick Game earn→spend (the Gimkit headline — shipped additively)
`/play` now has a per-run **Energy** meter (separate from the day-streak combo): **+1 Energy per correct
answer** (cap 6), spent during a question on **free in-run boosts** — 50/50 (3⚡), Hint (2⚡), 2× Sparks
(4⚡). Reuses the existing boost effects; **zero change to the Sparks economy** (these are free, earned by
performing, distinct from the bought powerup inventory). 0 new lint errors.
- ✅ CHECK: answer correctly → Energy dots fill; spend buttons enable when affordable; 50/50 removes 2
  wrongs, Hint shows the hint, 2× flags double Sparks — all without spending owned powerups/Sparks.

## ⚔️ Multiplayer deepen (latest — test with bots)
- **Knockout elimination callouts with names** — the flash now reads "💀 Alice, Bob knocked out! · 3 left"
  (new additive read-only RPC `ko_recent_out`, migration `ko_recent_out_callout`; zero change to the live
  `ko_state`/`ko_advance` flow). ✅ CHECK with bots: when bots get eliminated, their names appear in the flash.
- **Knockout one-use powerups (NEW — strategy layer)** — each player is dealt one random powerup on join:
  **🛡️ Shield** (survive one wrong answer this round) or **✨ Double** (2× points this round). A button above the
  answers activates it for the current question; once used it's spent for the game. Server: `ko_powerup` (draw,
  idempotent) + `ko_use_powerup` (activate) RPCs; `ko_submit` doubles points and `ko_advance` skips elimination
  when shield is active for that round (migration `knockout_powerups`; both core fns recreated identical except
  the one powerup condition each). Granted to anon + authenticated, so guests get powerups too.
  - ✅ CHECK (needs 2+ real players or bots, since solo you auto-win): activate **Shield**, then answer **wrong** →
    "✗ Wrong — but 🛡️ Shield saves you!" and you survive to the next round (not in the 💀 callout). Activate
    **Double**, answer **right** → the "+points" shows "(✨2×)" and your score jumps by double. After use, the bar
    shows "already used" and can't be re-triggered. (Bots don't use powerups — they're a clean control group.)
- **Heist steal feedback** — client-only: when your team's gold drops you see "💀 Robbed for Xg!", when the
  opponent's drops "💰 Your team stole Xg!" (detected from gold deltas; no server change). ✅ CHECK with bots
  in a heist game: on heist rounds, the toast fires.
- **Heist 🔓 Raid token (NEW — one-use strategy)** — every player holds ONE Raid token. On a 💰 HEIST ROUND
  (every 4th Q) a "Use Raid — DOUBLE your steal" button appears; activate it and a correct answer steals **2×**
  from the other team. Spent after one use; choosing *which* heist round to spend it on is the strategy. Server:
  new `heist_use_powerup` RPC + a single gated line in `heist_submit` (`v_pts *= 2` when raid is armed for that
  round) — `heist_submit` recreated otherwise identical; new nullable `powerup_used_round` column is null for all
  normal play, so zero behavior change unless activated (migration `heist_raid_powerup`). Granted to anon too.
  - ✅ CHECK with bots (you in one tab, bots via `/dev/bots`): reach a heist round, tap Raid, answer correctly →
    "💰 Robbed them for Xg! (🔓2×)" and the other team's gold bar drops by the doubled amount; the button then
    shows "Raid token already spent" on later heist rounds. Bots never raid (clean control).
- **Duel ranked divisions (NEW — the ladder hook)** — raw ELO is now wrapped in 7 named tiers
  🥉 Bronze → 🥈 Silver → 🥇 Gold (start, 1200) → 💠 Platinum → 💎 Diamond → 🔮 Master → 👑 Legend
  (pure client mapping `duelTier()`; the `duel_elo` engine already existed — zero server change). The Duel
  pick screen shows **your division card** (icon, ELO, W/L, a progress bar + "X ELO to <next tier>"), the
  result screen shows a **⬆ Promoted / ⬇ Demoted to <tier>** banner with confetti when you cross a boundary
  (computed from `my_elo` vs `my_elo − my_delta`), and the ladder rows are tinted by tier.
  - ⚠️ Needs a **2nd login** (Duel is account-based async, NOT bot/code-join — not in the bot harness).
  - ✅ CHECK: pick screen shows "🥇 Gold · 1200" for a new account; win ranked duels until ELO crosses 1350 →
    "⬆ Promoted to 💠 Platinum!" + confetti; the division card + ladder colors update; casual duels show no banner.
  - **Profile now shows your Duel rank** — the header carries a division chip (your **peak** ELO across subjects,
    `duelPeak()`) next to the weekly-League chip; links to /duel. Hidden until you've played a ranked duel.
    ✅ CHECK: after a ranked duel, /profile shows e.g. "🥇 Gold · 1240" beside the League chip.
- **Tycoon milestones** — confetti as cash crosses $500/2k/8k/25k/75k.
- **Live host answer-count** — the projector header shows "🙋 X/N answered · all in!" (read-only RPC
  `live_answer_count`, migration `live_answer_count`; polls every 1.5s during a question). ✅ CHECK with
  bots in a Live game: as bots answer, the host count climbs.
- **Live host TEAM MODE (NEW — option a, host-display only)** — on the host lobby a "👥 Team mode" toggle
  splits the class into 🔴 Red vs 🔵 Blue (balanced, by stable player-id order so it never reshuffles as
  scores move). Lobby shows the two rosters to read out; during play a **team score-race bar** (sum of each
  team's scores) sits above the live scoreboard, and the final screen declares the winning team. **100%
  host-side** — zero change to `create_game`/`join_game`/`submit_answer`/scoring or the player experience
  (players still play normally and don't see a team). Host page lints clean (0 errors).
  - ✅ CHECK with bots (`/dev/bots` → Live, spawn ~4): on the host lobby tap Team mode → two rosters appear;
    start → the Red/Blue bar moves as bots answer; finish → "🔴 Red team wins!" (or Blue/Tie). Toggle off →
    original flat lobby + single scoreboard, unchanged.

## 🏠 Home daily-loop hook — DailyNudge (NEW — the session-open pull)
A self-contained widget (`components/daily-nudge.tsx`) added with a **single insertion** on home (after
HomeStats, before HqChip — your layout otherwise untouched, like HqChip). It surfaces the **one most urgent
thing to do today**:
1. **Streak about to lapse** (loss aversion — the strongest retention lever): if you have a streak and
   `streaks.last_date` isn't today → a warm "🔥 Keep your N-day streak! Play one quick game today" → /play
   (also mentions due reviews if any).
2. else **Reviews due**: "🧠 N reviews ready · +3 ✨ each" → /review (ties into the new SRS reward).
3. else renders **nothing** (studied today + nothing due = no clutter).
- Pure read (streaks row + `get_due_reviews` count); signed-out → null. 0 lint errors.
- ✅ CHECK: with a live streak, come back on a new day without studying → the red streak nudge shows; study →
  it disappears; with due reviews and streak safe → the review nudge shows; brand-new/all-caught-up → nothing.

## 📝 Exam mode — real exam-tool UX (NEW, pure client)
The Section I simulation now behaves like a proper exam interface:
- **Question palette** — a 10-wide grid of numbered cells under the question; tap any to jump there. Cells show
  **answered** (filled plum), **blank** (parchment), **🚩 flagged** (gold inset ring), and the current Q (plum
  ring), with a legend. Far better than Prev/Next for a 20-question paper.
- **Flag for review** — a 🚩 toggle per question; the header shows the flag count ("… · 🚩 3").
- **Personal best** — on submit, your % is saved per subject+year in localStorage; beating it shows
  **"🎉 New personal best!"**, otherwise it shows your standing best + band. Deliberately **no Sparks reward**
  (exam has no daily cap, so paying currency would be farmable — the band + PB is the reward). 0 lint errors/warnings.
- ✅ CHECK: start an exam → flag a couple, answer some → palette reflects answered/flagged/current and jumps on
  tap; submit → band + "New personal best!" the first improving run, "Personal best: N%" on a worse retry.

## 🧠 Review (spaced repetition) now REWARDS studying (NEW — biggest addictive gap closed)
Reviewing was previously unrewarded (pure SM-2, no XP/Sparks) — the clearest "studying should feel like
progress" miss. Now **each genuinely-due card pays +3 ✨** on grade, credited server-side inside `grade_review`
(migration `review_reward_sparks`; SM-2 math byte-identical, added a due-gated reward + an `awarded` return col).
- **Farm-proof by design:** the reward only fires when `due_at <= today`. Grading a card pushes its due date
  into the future, so re-grading the same card immediately earns 0 — you can only earn by reviewing cards that
  are actually due (exactly the SRS incentive we want). No daily-cap hack needed.
- **Client juice:** the review header now shows a live 🔥 streak (consecutive correct) + ✨ session Sparks
  (pops on each award); the complete screen counts up "+N ✨ earned". 0 new lint errors.
- ✅ CHECK (signed in, have due cards — miss some questions in /play first to seed them): /review → each due
  card grade bumps the ✨ counter by 3 and your wallet rises; finish → "+N ✨ earned" counts up. Re-open /review
  with nothing due → "All caught up", no farmable Sparks.

## 🃏 Collection set-completion (NEW — the "gotta complete the set" hook)
The card collection now surfaces **set completion** (Blooket/TCG's core pull): an **overall completion %
bar** under the title, and each subject section shows **have/total** with a **✅ COMPLETE** badge when full and
a **"N/T · one to go!"** nudge when you're a single card away. Pure client (derived from the owned-cards data) —
zero backend change. 0 new lint errors.
- ✅ CHECK (signed in): /collection shows the % bar + per-subject counts; own all of a subject → "✅ COMPLETE";
  own all-but-one → "one to go!" in coral. Opening packs moves the bar.
- ◻️ FUTURE (needs server, award-once): a Sparks/badge **bonus** for completing a set (a `claim_set_bonus`
  RPC + a claimed-marker). Logged here so it's not lost; the visibility hook above stands on its own.

## 👹 Weekly Boss — raid-share framing (NEW, pure client)
The boss page now reads like a raid: under the class HP bar it shows **"{X}% defeated · {N} damage dealt by
the class"** (and **"🔥 So close — finish it!"** at ≥90%), and your-damage stat now shows **"· {Y}% of the
raid"** (your_damage ÷ total dealt). All derived from the existing `get_boss` fields — no backend change.
- ✅ CHECK: /boss after the class has chipped some HP → the % defeated + your-share numbers read sensibly;
  near 0 HP shows the "finish it!" nudge.

## 🏅 Achievements — chase-the-near-miss ordering (NEW, pure client)
Badges now sort **earned-first, then locked by how close you are**, and any locked badge ≥75% gets a coral
ring + **"· almost there!"** label — surfacing the ones you're about to unlock (the Duolingo "you're so
close" pull). Pure client sort, 0 new lint errors.
- ✅ CHECK: /achievements lists unlocked first, then your closest-to-unlock; a badge near its threshold shows
  the coral "almost there!" treatment.

## ✨ Polish pass (deepen, latest)
- **HqChip** on home — surfaces collectable HQ Sparks (idle retention hook).
- **Count-up juice** on Knockout XP + Match Sparks results (cohesive with Campaign/Tycoon).
- **Tycoon depth**: shows "+$X per correct" (upgrade payoff visible) + new **Auto-Lab** passive-income
  upgrade (active vs passive strategy).
- Shared **wrong-answer shake** on AnswerTile (every mode); Quick Game **combo** + **rank nudge**.

## 🤖 DEV TOOL — Bot Harness (`/dev/bots`) — test multiplayer solo
Spawn guest bots that join a live game by code and auto-answer. Covers **Knockout, Heist, Live Class**
(the code-join modes). Bots call Supabase directly, so they work even when the forwarded port is private.
- Use: open the game in one tab (copy the code) → `/dev/bots` → pick mode → paste code → Spawn → start
  the game on your screen → bots answer each round (log shows activity). Bots answer deterministically
  (spread of right/wrong), good for testing flow/sync/scoreboard/eliminations.
- **Duel not included** — it's account-based async matchmaking, not guest code-join (test with a 2nd login).
- ⚠️ For phone / incognito / 2nd-device manual testing, set Codespace **port 3000 to Public** (PORTS tab) —
  otherwise GitHub auth-redirects block it (that's the `manifest.webmanifest` CORS noise, harmless to the app).

## 🏦 NEW MODE — Lab Tycoon (`/tycoon`) — the Gimkit upgrade loop, HSC-themed
Solo, self-contained (its own "Research $" currency — does NOT touch Sparks/economy). Reachable from
the home modes grid (gold/green "NEW" card).
- Loop: pick subject → 2-minute session → answer HSC questions to earn Research $ → reinvest in
  **upgrades that compound**: 💵 Lab Funding (+$/correct), 📈 Grant Multiplier (×earnings),
  🔥 Momentum (+% per streak), 🛡️ Tenure (wrong answers keep your streak). Beat your best ($ saved to
  localStorage). Awards a modest Sparks bonus (correct×2+5) + feeds mastery/quests like other modes.
- ✅ CHECKS: earning + the "+$" float pops; upgrades get more expensive each level and visibly speed up
  earning; streak bonus shows %; timer ends the run → final $ + "new best"; "End early" banks it.
- ⚖️ Tunable in `app/tycoon/page.tsx`: SESSION (120s), the UP cost curves, earn formula.
- Safe to build untested (solo, isolated currency); but eyeball the economy feel when you can.

## 🟢 Verified working at the code level (this session)

- Reward write-backs all fire on quiz finish: **XP** (correct×10), **streak**, **boss damage**
  (= correct count, via `apply_boss_damage`), **Sparks** (`credit_coins`, correct×2+5+bonus),
  and **daily quest** progress. Daily only counts the first attempt per subject per day.
- Responsive/fullscreen refactor compiles: **all 26 routes return HTTP 200**, no compile errors,
  no new lint errors introduced.
- Service worker no longer registers in dev (and unregisters itself) — stale-cache issue fixed.
