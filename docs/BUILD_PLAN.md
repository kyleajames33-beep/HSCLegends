# HSC Legends — Build Plan

> Phone-first quiz arena that lives alongside hscscience.com.au. Teacher-launched, student-retained.
> This document is the source of truth for the build. Tickets are written to be handed directly to Claude Code.

---

## 0. Locked strategy (do not re-litigate)

- **Additive, not extractive.** HSC Legends is a new mobile-first surface. Nothing is removed from hscscience.com.au; the web keeps all its gamification.
- **Shared backend.** Same Supabase project as HSC Science → shared auth, XP, streaks, leaderboard. Two doors into the same world.
- **v1 scope = HSC only.** Y11–12, five subjects: Biology, Chemistry, Physics, Maths Standard, Maths Advanced, Maths Ext 1.
- **Mode priority:** `Live Class Game` (the wedge) → `Quick Game + Streaks` (retention) → `Boss Battle` (async social). **Duel (1v1 realtime) and Y7–10 are Phase 2.**
- **Stack:** Next.js (App Router, TS) PWA + Supabase (Postgres, Auth, Realtime, Edge Functions) + Tailwind. Boring and well-trodden. Deploy on Vercel (or wherever HSC Science lives).
- **Ethics guardrails (non-negotiable):** weekend streak pause, 1 auto-freeze/week, opt-in notifications only, no FOMO spam. Skill, not slot machine — luck affects ≤20% of any outcome.

### The single design rule

> Does this make it easier for a **teacher to host on a Tuesday afternoon**, or for a **student to play on the bus Wednesday morning**? If neither, defer it.

This rule defers (for v1): Duel, custom avatars, the locker, the trophy wall, multiple paid tiers.

---

## 1. Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Repo | This repo (`HSCLegends`), separate from `Teaching-APP` | Focused, disciplined surface; can deploy independently |
| Backend | **Existing HSC Science Supabase project** | Shared progression is the whole thesis |
| Safe building | **Supabase dev branch**, merge when stable | Never touch the live DB serving current users until verified |
| Shared tables | **Read-only reuse** of auth / XP / streaks / leaderboard | Don't fork the student's identity |
| New tables | `questions`, `game_codes`, `game_sessions`, `answers`, `boss_state` | Legends-specific, clearly namespaced |
| Realtime (Live Class Game) | Supabase Realtime broadcast + presence | No bespoke websocket infra |
| Question delivery | Postgres function / Edge Function `get_quiz_questions()` | One spine both surfaces can hit |
| Hosting | PWA at `play.hscscience.com.au` | Installable to home screen, opens in 3s |

### Target normalised question schema (the spine)

```ts
type Question = {
  id: string;            // stable, globally unique
  subject: 'biology'|'chemistry'|'physics'|'maths-standard'|'maths-advanced'|'maths-ext1';
  year: 11 | 12;         // 7–10 reserved for Phase 2
  module: string;        // e.g. 'module-7'
  lessonId: string;
  topic: string;         // normalised slug (kebab-case)
  topics: string[];
  stem: string;
  options: string[];     // multiple choice
  correctIndex: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
  bloom: 'remember'|'understand'|'apply'|'analyse';
  quality: 'original' | 'variant';   // variants deprioritised in selection
  syllabusPoint: string | null;      // future tagging hook
};
```

---

## Phase 0 — Backend foundation  (~1 week)

Goal: a single queryable question spine in Supabase, plus confirmation the shared tables fit.

**P0-1 — Audit existing Supabase schema** ✅ DONE → see [`EXISTING_SCHEMA.md`](./EXISTING_SCHEMA.md)
- Project confirmed: `HSCScienceSyd` (`rerfrskojieacxthfavb`). Shared spine already exists: `user_profiles` (incl. alias + privacy), `user_stats`+`xp_events` (XP/coins), `streaks`, `weekly_quiz_attempts`. Duel fully scaffolded. RLS on everywhere.
- Surfaced gotchas now baked into P0-4 / P1-2 / P2-2: no `questions` table yet (keystone); inconsistent subject enums (none allow `maths-ext1`); RLS blocks anonymous writes.

**P0-2 — Clone & inventory question banks** ✅ DONE → [`BANK_INVENTORY.md`](./BANK_INVENTORY.md)
- 60 banks found (50 HSC v1, 10 junior Phase 2). Three HSC schema variants identified (A / A′ / A″).

**P0-3 — Schema normaliser** ✅ DONE → [`scripts/normalise-banks.mjs`](../scripts/normalise-banks.mjs) → `out/questions.json`
- Handles **4 schemas across 2 sources** (`question-bank-data.js` + `*.review.json`) via sandboxed `window` exec / `JSON.parse` + `coerce()`. **9,395 questions (8,299 original / 1,096 variant), 0 malformed, 0 dup ids, 0 control chars.**
- Repairs: ~220 q from 2 syntax-broken files; 79 q from missing ids; **319 q LaTeX-recovered** from lossy escapes.
- **maths-advanced Y12 is NOT empty** — its content lives in `.review.json` (420 q). No content sprint needed for v1.
- Residual QA (non-blocking): a few hundred maths questions have unrecoverable stripped-backslash LaTeX → prefer `source:'question-bank'` for maths in the selector. See [`BANK_INVENTORY.md`](./BANK_INVENTORY.md).

**P0-4 — Supabase migration: `questions` table + indexes**
**P0-4 — Supabase migration: `questions` table + seed + constraints** ✅ DONE (applied to live `HSCScienceSyd`)
- `questions` table (17 cols incl. `source`, `quality`, `difficulty`), indexes on `(subject,year,module,difficulty,quality)` + `topic`, RLS enabled with public read policy.
- **9,395 rows seeded** via REST bulk-load (`scripts/seed-rest.mjs` / `scripts/gen-seed-sql.mjs`). Verified: 6 subjects, 0 bad options.
- Subject CHECK constraints widened to the canonical 6 on `xp_events`, `weekly_quiz_attempts`, `duel_challenges` (supersets — no existing row broke).

**P0-5 — Question query API**
- Postgres function (or Edge Function) `get_quiz_questions(p_subject, p_module, p_difficulty, p_count, p_user)`: prefers `original`, falls back to `variant` only when the pool is short, avoids recently-shown questions for that user.
- ✅ DONE → `get_quiz_questions(p_subject, p_year, p_module, p_difficulty, p_count, p_exclude[])` deployed to live; prefers originals, prefers curated source for maths, excludes seen ids, randomised. Granted to anon+authenticated. Smoke-tested.
- ⚠️ Later hardening: the selector returns `correct_index` to the client — fine for MVP, but grade server-side for Ranked/Live before trusting scores.

**P0-6 — Next.js PWA skeleton** ✅ DONE
- Next 16 (App Router) + TS + Tailwind v4. Supabase browser client (`lib/supabase/client.ts`) on the shared project via publishable key. `lib/questions.ts` wraps the RPC. Manifest (`app/manifest.ts`) + service worker (`public/sw.js`) + icons → installable, `standalone`, theme-colored.
- Pages: phone-first home (`app/page.tsx`, single Quick Game CTA) + working Quick Game (`app/play/page.tsx`) that pulls real questions through `get_quiz_questions` — **proven end-to-end with the anon key against the live DB.** Build passes; all routes 200.
- ⬜ Remaining for P1: real auth/login UI (shared session is wired at the client level; the login flow + post-game signup land in P1-2).

---

## Phase 1 — Live Class Game  (~2 weeks)  ← THE WEDGE

Goal: a teacher can spin up a live game in <8 minutes; students join with a code and play on their phones. This is your acquisition engine.

**Backend (live):** tables `game_sessions` / `game_players` / `game_answers` (RLS public-read, writes via SECURITY DEFINER rpcs). RPCs `create_game` / `join_game` / `start_game` / `next_question` / `get_live_question` / `submit_answer`. Both game tables in the `supabase_realtime` publication. **Full loop verified end-to-end via `scripts/test-live-game.mjs`** — server-graded scoring with speed bonus, answer never leaves the server, double-submit rejected, correct final leaderboard.

**Frontend (built):** `app/host/page.tsx` (create → code → realtime lobby → drive questions → podium), `app/join/page.tsx` (code+alias → lobby → answer → reveal → final rank), `lib/live.ts` (rpc + realtime wrappers). Home links to both. Build passes.

**P1-1 — Game code + lobby (teacher)** ✅ DONE — `create_game` + realtime lobby; unambiguous 6-char code; 6h expiry.
**P1-2 — Student join (no account)** ✅ playable without an account. ⬜ post-game *signup to keep XP* (needs auth — see below).
**P1-3 — Live game loop** ✅ DONE — synced via Realtime (DB-as-truth → rejoin works), server-authoritative scoring. ⬜ remaining: per-question countdown timer + auto-advance (currently host taps Next).
**P1-4 — Podium + write-back** 🟡 podium ✅; ⬜ XP write-back to shared `xp_events`/`user_stats` (needs auth).
**P1-5 — Catch-up mechanic** ⬜ deferred (one random double-points question; skill ≥80%).

**⬜ Blocks the rest of P1 → AUTH.** Build the shared Supabase login next so signed-in players get XP written to the shared leaderboard and the post-game signup works. Anonymous play already works; auth only gates persistence.
**⚠️ Known MVP cheat vector:** `questions` is public-read, so a determined student could text-match a stem to find the answer. Acceptable for classroom; harden by restricting `questions` reads / serving stems via a definer rpc before any stakes.

---

## Phase 2 — Quick Game + Streaks  (~2 weeks)  ← RETENTION ENGINE

Goal: the thing students open on the bus. The day-7→day-30 loop.

**P2-1 — Solo Quick Game**
- "Today's Quick Game" as the single primary home action. 10 questions, 60s, instant feedback, XP write-back.
- **Acceptance:** from cold app open to first question in <3s; one unambiguous primary button.

**P2-2 — Streak system (with mercy)**
- Visible streak counter; increments on a completed day. **Weekends don't break streaks. 1 auto-freeze/week.** Prominent in app header + (later) push.
- **Extend the existing `streaks` table additively** (it currently only has `current`/`last_date`/`updated_at`): add `freeze_available` (bool), `last_freeze_week` (text), `frozen_on` (date). Do not drop/rebuild.
- **Acceptance:** missing a Saturday/Sunday never resets; missing one weekday consumes the auto-freeze silently; missing two weekdays in a week resets; logic covered by tests.

**P2-3 — Two-progression display**
- Reversible Rank/League (win/loss flavour) **alongside** one-directional XP (only ever grows). Reuse existing XP.
- **Acceptance:** a bad day lowers Rank but never lowers XP; both visible on the home screen.

**P2-4 — Leaderboard read/write**
- Quick Game results feed the shared leaderboard; app shows weekly leaderboard scoped to subject/year.
- **Acceptance:** identical numbers on web and app for the same user/week.

---

## Phase 3 — Boss Battle + class layer  (~2 weeks)  ← ASYNC SOCIAL

Goal: make the solo Quick Game socially meaningful — you're chipping a shared boss with classmates.

**P3-1 — Weekly boss state**
- Per subject/module boss with shared HP; every correct answer (Quick Game or Boss mode) chips it.
- **Acceptance:** concurrent answers decrement HP atomically (no lost updates); boss resets weekly.

**P3-2 — Class join via code**
- Students join a class (teacher-issued code); boss HP/contribution scoped to the class.
- **Acceptance:** a student's contribution shows only against their class boss.

**P3-3 — Teacher dashboard (boss)**
- Teacher configures the weekly boss (subject/module) and sees class contribution.
- **Acceptance:** teacher can set next week's boss in <2 min; live contribution view.

---

## Phase 4 — Polish + pilot  (~2 weeks)

**P4-1 — Push notifications (opt-in, minimal)** — only "streak ending in 4h" and "your class is fighting a boss". No other pushes. Acceptance: opt-in gated; exactly two notification types exist.

**P4-2 — Share-the-streak** — lightweight share card. Acceptance: generates an image/link without exposing PII.

**P4-3 — Onboarding + install prompt** — first-run flow; A2HS nudge after first game. Acceptance: new user reaches first question without reading instructions.

**P4-4 — Pilot** — run in your own classes + 2–3 teacher friends; collect real bugs + retention data. Acceptance: ≥1 real class session hosted; day-2 return measured.

---

## Out of scope for v1 (explicit)

Duel (1v1 realtime) · Y7–10 content · custom avatars / locker / trophy wall · paid tiers · notification types beyond the two above.

## Phase 2 backlog (after v1 proves out)

Duel mode (Casual default + opt-in Ranked — **never** make every match cost rank) · Y7–10 question generation · richer cosmetics · TikTok-style share loops.

---

## Build order summary

```
P0 (backend spine) → P1 (Live Class Game) → P2 (Quick Game + Streaks) → P3 (Boss) → P4 (polish + pilot)
~1wk                 ~2wk                    ~2wk                        ~2wk        ~2wk      ≈ 9 weeks
```

Each phase is independently shippable. You can stop after any phase and still have something real.
