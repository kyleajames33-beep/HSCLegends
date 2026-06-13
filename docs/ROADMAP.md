# HSC Legends — Master Roadmap & Competitive Hitlist

_Last updated: 2026-06-13. Source of truth for what we build next. Derived from a 6-agent competitive audit of Kahoot, Quizizz/Wayground, Gimkit, Blooket, Duolingo, Quizlet, Anki, Khan Academy, Atomi, Education Perfect, Edrolo, Studyclix, ATAR Notes + the NSW HSC market._

---

## The winning position (why we exist)

Across the entire market, **one cell is empty**: a genuinely **fun, free, phone-first, social, NSW-HSC-syllabus-aligned quiz GAME, playable all year**.

| | Content depth | Real game/competition | Free + mobile | HSC-syllabus-tagged |
|---|---|---|---|---|
| Atomi / Edrolo | ✅ | ❌ | ❌ ($150–470/yr) | ✅ |
| Education Perfect | ⚠️ | ✅ (once/yr, a chore) | ❌ school-sold | ✅ |
| Studyclix | ✅ topic | ❌ | ⚠️ | ❌ **no NSW** |
| Quizlet | ⚠️ user-made | ⚠️ classroom | ⚠️ paywall creep | ❌ |
| Blooket / Gimkit / Kahoot | ❌ | ✅✅ | ✅ | ❌ generic |
| AI tutors (Allie) | ✅ | ❌ | ✅ | ✅ |
| **HSC Legends** | _(building)_ | ✅✅ **all-year** | ✅ | ✅ |

**Our unfair advantages:** ~9,400 real HSC questions already tagged `subject/year/module/topic/difficulty/bloom/explanation`; a working multiplayer Arena (Knockout/Duel/Heist) that already out-designs EP's crude points; and a direct funnel to hscscience.com.au.

**The universal complaint about every rival** = _luck/speed beats mastery_ + _paywalls gate learning_ + _shallow/no explanations_. We win by keeping all the dopamine (collection, daily rewards, power-ups, juice) **while bounding randomness so rank tracks correct answers, leading with spaced-repetition exam prep, showing visible progress, and never selling currency/answers/advantage — only cosmetics.** That is the ethically-addictive position none of them occupy.

---

## ✅ SHIPPED 2026-06-13 (this session)

All on `main`, prod DB migrated, build-green, RPCs verified end-to-end (rolled-back SQL), routes render-smoke-tested. **Not yet UI-tested by a real signed-in user** — see memory `pending-tests`.

- **Economy foundation** — earn-only Sparks (`coins`), `coin_ledger`, `credit_coins`/`spend_coins`/`get_wallet`
- **Legend Cards** ([/collection](../app/collection/page.tsx)) — 36 cards, rarity tiers, packs w/ published odds, dupe sell-back, pack-opening animation
- **Learning engine** ([/review](../app/review/page.tsx), [/progress](../app/progress/page.tsx)) — SM-2 SRS, per-topic mastery, predicted band; `record_attempt` wired into `/play`
- **HSC modes** ([/exam](../app/exam/page.tsx), [/topics](../app/topics/page.tsx)) — timed Section I → band; syllabus map by module + drill
- **Retention** ([/rewards](../app/rewards/page.tsx)) — Daily Spin + login ladder, Streak Freeze, daily/weekly Quests; `increment_quest` wired into `/play` + all Arena modes
- **Power-ups** — 50-50/Hint/Double Sparks/Skip/Time Freeze; shop on `/rewards`, wired into `/play`
- **Achievements** ([/achievements](../app/achievements/page.tsx)) — 14 badges from live activity
- **Welcome bonus** — 200 Sparks on first sign-in (idempotent)
- **Boss art** — Biology real (OpenArt), optimised to 512px (~90% lighter); other 5 = placeholders

**Blocked / deferred:** AI "Quiz My Notes" (needs ANTHROPIC_API_KEY — not in env). Smart notifications (needs pg_cron + device test). Leagues, Friends, Solo Boss Campaign (bigger, not started).

---

## Four build pillars

1. **Retention Engine** — the daily habit loop (streaks+mercy, quests, gems, daily spin, smart notifications, leagues, onboarding).
2. **Collection & Juice** — the dopamine (earn-only collectible "Legend Cards", power-ups, seasons/term pass, sound/animation polish).
3. **Learning Engine** — the real value & visible progress (SRS review, per-topic mastery, progress dashboard, explanation reveal, confidence rating, adaptive difficulty, predicted band, new question types).
4. **HSC Content & Funnel** — credibility (syllabus topic map, past-papers-by-topic, exam mode, class championships, hscscience.com.au deep-links, AI quiz-from-notes, content QA).

---

## Ethics guardrails (non-negotiable — our users are 16–18)

- **All currency earn-only.** Never sell gems/cards for real money to minors (FTC fined HoYoverse $20M Jan 2025; AU/EU tightening on gacha). If we ever monetise, sell **cosmetics only, at a flat price, never randomised**.
- **Random rewards must publish odds** and be earn-only → sidesteps loot-box regulation entirely.
- **Loss-aversion with mercy:** streaks must have free freezes + a grace repair. Never punish wrong answers (no "hearts" that block learning).
- **Competition is opt-out, small-cohort, and rewards _improvement_ too** — not just rank.
- **Notifications: max ~3/week, behaviour-triggered, encouraging copy only.** Never guilt/shame. User controls frequency.
- **Lead with learning.** Every answer can show its "why".

---

## THE HITLIST (prioritised; ⭐ = building this session)

### Pillar 1 — Retention Engine
- [ ] ⭐ **Gems economy foundation** — earn-only `gems` balance + `gem_ledger` audit table + `credit_gems()`/`spend_gems()` RPCs. Earn from quizzes, quests, daily goal, league podium, boss wins. _The connective tissue for everything below._
- [ ] ⭐ **Streak Freeze + auto-repair** — `streak_freezes` count; daily cron decrements a freeze instead of zeroing a missed streak; 1 free/week + 24h grace repair. (Mercy, not a dark pattern.)
- [ ] ⭐ **Daily Spin + escalating login ladder** — 1 free spin/day (gems/cards), 7-day claim ladder, day-7 guaranteed rare. Wired to web-push.
- [ ] ⭐ **Quests** — `quests` + `user_quests`; 3 rotating daily ("answer 10 Chem Qs", "get a 5-streak", "play a Duel") + weekly + monthly-completion badge; each grants gems.
- [ ] **Smart notification engine** — `notifications_queue` + cron; max 1/day ~3/wk; triggers: streak-at-risk at user's active hour, "league resets in 6h you're 2 from promotion", boss-HP-low, duel-revenge. Encouraging copy, frequency toggle.
- [ ] **Leagues refinement** — named divisions (Bronze→Diamond), ~30-person cohorts, promotion/relegation via Sunday cron, podium gems, **"Most Improved" badge** so weak students aren't only ever losing.
- [ ] **Onboarding hooks** — pick a daily goal; instant Day-1 streak + starter gems + first free card before they leave.
- [ ] **Achievements/badges** — tiered (`Answer 1k/10k/50k Qs`, `Win 5 Duels`, `30-day streak`). App Badging API for streak-at-risk (PWA widget surrogate).

### Pillar 2 — Collection & Juice
- [ ] ⭐ **Legend Cards** — collectible HSC-themed character/scientist cards, rarity tiers (Common→Legendary→**Mythic**), earn-only gacha **packs** with **published drop rates**, duplicate→gems sell-back. Reuse DiceBear + boss art. Pack-opening reveal animation. _#1 engagement gap._
- [ ] ⭐ **Power-ups** — 5 reusable: **50-50, Time Freeze, Double Points, Streak Saver, Redemption** (one missed Q returns at end). Earned/bought with gems, toggled per mode (Quick/Knockout/Duel/Heist). Cheap, high-juice.
- [ ] **Seasons / Term Pass** — 8–10 week terms matching the HSC calendar; free XP-gated reward track (+ optional cheap _cosmetic-only flat-price_ track). One fresh seasonal mode per term.
- [ ] **Juice pass** — sound effects, haptics, richer answer feedback, podium victory animations, more Lottie moments, combo/streak flourishes.
- [ ] **Solo Boss Campaign** — single-player progression map; correct answers damage a series of subject bosses (reuse boss art + Weekly Boss tech), unlocking cards/areas. For the individual player with no class of 30.

### Pillar 3 — Learning Engine
- [ ] ⭐ **SRS "Review" mode** — `review_cards(user_id, question_id, ease, interval_days, due_at, reps, lapses, last_reviewed_at)`; created on a wrong answer, SM-2 update RPC with interval fuzz; daily "X due" badge → Review queue. _Highest impact / lowest effort; our pedagogical moat._
- [ ] ⭐ **Per-topic mastery %** — `topic_mastery(user_id, topic, level, points, ...)`; Khan-style Familiar/Proficient/Mastered, **downgradeable**; roll up to module & subject.
- [ ] ⭐ **Progress dashboard** — topic heatmap + "Focus on these 3" weak-area drill (2 Qs × 3 weakest topics). Turns invisible learning into visible, addictive gains.
- [ ] ⭐ **Explanation reveal** — show the stored `explanation` after every answer (attempt-first → learn-why; productive failure). Near-zero effort, already stored.
- [ ] **Confidence rating** — post-answer Shaky/OK/Solid; feeds SRS interval; adds metacognition.
- [ ] **Adaptive difficulty** — use existing `difficulty 1–3` + `bloom`; escalate as topic accuracy rises, drop back when it falls.
- [ ] **Predicted HSC band** — per subject, shown as a **narrowing range** ("Band 4–5, sharpening as you practise"); explicit note it estimates the exam half only (not moderated assessment).
- [ ] **New question types** — type-the-answer (fuzzy/Levenshtein grading), timed Match mini-game, cloze. Variety + desirable difficulty.

### Pillar 4 — HSC Content & Funnel
- [ ] ⭐ **Syllabus Topic Map** — per subject, the official 2017 Module → Inquiry-Question/subtopic tree with per-topic mastery rings. (Data already in `module`/`topic`/`topics[]`.)
- [ ] ⭐ **Exam Mode (timed)** — 20-question "Section I" MC simulation with countdown + band-style scoreout.
- [ ] ⭐ **Past-Papers-by-Topic** — drill a topic across all years; claim the Studyclix model that has **zero NSW presence**.
- [ ] **Class Championships** — time-boxed school-vs-school events over existing classes + leaderboards (the EP World Series mechanic, but fun & all-year).
- [ ] **hscscience.com.au "Learn this" deep-links** — on a wrong answer / weak topic, deep-link to the matching lesson. _The funnel the app exists to serve._
- [ ] **AI "Quiz My Notes"** — paste/upload notes/PDF → Claude API generates an HSC-style quiz, playable + saved. Table-stakes at the top tier; doubles as a funnel hook.
- [ ] **Accuracy Mode + answer explanations** — equal-time, correctness-only scoring toggle. Directly attacks the "speed-rewards-guessing" complaint; matches our mission.
- [ ] **Content QA pass + "syllabus-verified" badge** — audit bank vs the 2017 syllabus; counters Quizlet/ATAR-Notes error complaints.
- [ ] **Model answers / Band-6 exemplars** — attach exemplar + marking-criteria to explanations (Studyclix self-assessment loop).

### Cross-cutting / infra
- [ ] **Boss art** — Biology done (OpenArt); generate the other 5 (Chem/Physics/Maths ×3). Batch-optimise all 24 to ~512px web PNGs.
- [ ] **Friends / social graph** — mutual-follow + async friend challenges (drop your run as a ghost into their Duel queue) + co-op "Study Quests" (highest-value _ethical_ engagement).
- [ ] **Bots** for live modes (so a solo player always has opponents).
- [ ] **2-device live play-tests**; rotate the exposed service_role key.

---

## NSW HSC syllabus reference (2017 syllabuses in force for 2025–26 exams)

- **Sciences:** `Modules → Inquiry Questions → Content`. 8 modules (1–4 = Yr11, 5–8 = Yr12). Working Scientifically embedded; Depth Study each year. Exam: 100 marks/3h, Section I = 20 MC.
- **Maths:** `Topics → Subtopics` (coded e.g. `MA-F1`).
- **Bands** (0–100): B6 90–100, B5 80–89, B4 70–79, B3 60–69, B2 50–59, B1 0–49.
- Year-12 module names per subject are catalogued in the AU-market research agent output (Bio: Heredity / Genetic Change / Infectious / Non-infectious Disease; Chem: Equilibrium / Acid-Base / Organic / Applying Chemical Ideas; Physics: Advanced Mechanics / Electromagnetism / Nature of Light / Universe to the Atom; etc.).
- Migration note: new NESA syllabuses hit exams 2027 (Maths) / 2028 (Bio, Physics) / 2029 (Chem) — plan a content migration, but build on 2017 now.

---

## Build order this session

0. Gems economy foundation (me) — everything else hangs off it.
1. **Parallel agents:** Collectibles (Legend Cards) · Learning Engine (SRS + Mastery + Progress) · HSC Modes (Exam + Topic Map + Past-papers) · Retention (Streak Freeze + Daily Spin + Quests).
2. Integrate into home/nav, wire explanation reveal + attempt recording, apply migrations, build, push.
