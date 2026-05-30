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
**P1-2 — Student join (no account)** ✅ playable without an account; ✅ post-game "Save my points" → login → score saved (player_id stashed across the redirect via localStorage).
**P1-3 — Live game loop** ✅ DONE — synced via Realtime (DB-as-truth → rejoin works), server-authoritative scoring, **per-question countdown timer on both screens + host auto-advance** (~2s after time's up; manual Next still works as a skip; players lock out when time expires). Browser-verified: login, host+join, full game.
**P1-4 — Podium + write-back** ✅ podium; ✅ XP write-back via `claim_game_xp` → shared `xp_events` + `user_stats` (idempotent per player; rejects anon — verified). Auto-saves when a signed-in player finishes.
**P1-5 — Catch-up mechanic** ✅ DONE — one random **Double Points** question per game (2× in `submit_answer`, banner on both screens). Skill still required; keeps the bottom half in contention. Verified: doubled question paid 300 vs 150.

**AUTH ✅ built** — `@supabase/ssr` server client + `middleware.ts` (cookie session), `lib/use-user.ts`, email one-time-code login (`app/login`), shared `HSCScienceSyd` project so accounts = HSC Science accounts (`handle_new_user` trigger auto-creates `user_profiles`; `user_stats` upserted on first XP). Home shows auth state.
- ⚠️ **Dashboard step required:** add `{{ .Token }}` to Auth → Email Templates → Magic Link, or login emails send a link instead of the 6-digit code.
- Anonymous sign-in is currently **disabled**; enabling it (one toggle) would let every player earn XP without a code — recommended later for the frictionless funnel.
**⚠️ Known MVP cheat vector:** `questions` is public-read, so a determined student could text-match a stem to find the answer. Acceptable for classroom; harden by restricting `questions` reads / serving stems via a definer rpc before any stakes.

---

## Phase 2 — Quick Game + Streaks  (~2 weeks)  ← RETENTION ENGINE

Goal: the thing students open on the bus. The day-7→day-30 loop.

**Backend (live + verified):** `record_quick_game` (XP → `xp_events`+`user_stats`, streak update; rejects anon — verified), `get_weekly_leaderboard` (opt-in, anonymous codename, ISO week; returns real rows via anon), `set_leaderboard_optin`. `streaks` extended additively with `last_freeze_week`. Weekday-gap math unit-checked (Fri→Mon=0, Mon→Wed=1, Mon→Thu=2).

**P2-1 — Solo Quick Game** ✅ `/play` now saves XP for signed-in players (auto on finish; "Sign in to save" → login → resumes via localStorage). ⬜ 60s timer not yet added (currently untimed).
**P2-2 — Streak system (with mercy)** ✅ DONE — weekend-safe + 1 auto-freeze/week; streak badge on home, streak result on finish. Ethics rules verified in SQL.
**P2-3 — Two-progression display** 🟡 XP (one-directional) + streak shown; ⬜ reversible Rank/League still to add.
**P2-4 — Leaderboard** ✅ `/leaderboard` — weekly, subject filter, opt-in toggle, "you" highlight. Reads shared `xp_events` (doesn't touch the web's `weekly_quiz_attempts`). ⬜ verify parity with web leaderboard semantics.
**⬜ Needs in-browser test** (after email login works): streak increment across a real save, XP appearing, opt-in toggle.

---

## Phase 3 — Boss Battle + class layer  (~2 weeks)  ← ASYNC SOCIAL

Goal: make the solo Quick Game socially meaningful — you're chipping a shared boss with classmates.

**Backend (live + verified):** `bosses` catalog (6 themed bosses, personalities borrowed from Teaching-APP), `boss_state` (per subject + ISO week, shared HP), `boss_contributions` (per user). `apply_boss_damage` (atomic `hp = greatest(0, hp - dmg)`, sets `defeated_at`), `get_boss(subject)` (anon-readable, no names exposed). Damage hooked into `record_quick_game` (1 dmg per correct answer). Verified: damage applies, HP decrements, `get_boss` returns all 6 at full HP fresh week.

**P3-1 — Weekly boss state** ✅ DONE — shared HP per subject, chipped by every correct Quick Game answer, resets each ISO week, atomic decrements. `/boss` page: emoji by HP%, class HP bar, your damage, # fighting, defeated state.
**P3-2 — Class join via code** ⬜ deferred — MVP uses a per-subject **global** boss (everyone fighting Biology shares one boss). Class-scoping reuses the Live Game code concept; add a `class_id` column to boss_state/contributions when needed.
**P3-3 — Teacher dashboard (boss)** ⬜ deferred — bosses are currently a fixed catalog; teacher configuration + contribution view comes with class-scoping.
**⬜ Needs in-browser test** (after login works): play a signed-in Quick Game → boss HP drops on `/boss`, your-damage increments.

---

## Phase 4 — Polish + pilot  (~2 weeks)

**P4-1 — Push notifications (opt-in, minimal)** — only "streak ending in 4h" and "your class is fighting a boss". No other pushes. Acceptance: opt-in gated; exactly two notification types exist.

**P4-2 — Share-the-streak** — lightweight share card. Acceptance: generates an image/link without exposing PII.

**P4-3 — Onboarding + install prompt** 🟡 install nudge done (`components/install-prompt.tsx` — native prompt on Android, manual instructions on iOS, dismissal remembered). Home is now a signed-in hub (streak + total XP via `HomeStats`). ⬜ remaining: a guided first-run flow (set year/subjects once).

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
