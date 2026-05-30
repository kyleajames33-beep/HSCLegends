# P0-1 — Existing Supabase schema audit

**Project:** `HSCScienceSyd` (`rerfrskojieacxthfavb`), Sydney (ap-southeast-2), Postgres 17. ACTIVE.
**Verdict:** The shared-progression spine already exists and is well-built. Legends plugs in by **reading/writing existing tables** for identity/XP/streak, and **adding** new tables only for questions + live-game state. Duel is already fully scaffolded (Phase 2 head start). RLS is enabled on every table.

---

## Shared tables Legends reuses (do NOT redefine)

### Identity — `user_profiles` (PK `user_id` → `auth.users.id`)
Rich and privacy-aware. Already contains the alias + consent system the plan assumed we'd have to build:
- Alias: `codename`, `handle_tag` (smallint), `display_name`, `name_display_pref` (`handle`|`firstname`|`both`), `first_name`. → **This is the "anonymous alias" for Live Class Game leaderboards. Already done.**
- Profile: `year` (smallint), `subjects` (text[]), `school_name`, `postcode`, `char_id`.
- Privacy: `is_over_15` (bool), `leaderboard_opt_in`, `school_lb_opt_in`, `suburb_lb_opt_in`, `analytics_consent`, `privacy_consent_at`.

### XP / coins — `user_stats` + `xp_events`
- `user_stats` (PK `user_id`): `total_xp` (bigint), `coins` (bigint), `updated_at`. Rolled-up totals.
- `xp_events` (append-only log): `reason_key`, `amount` (≥0), `kind` (`xp`|`bonus_coin`), `subject`, `created_at`.
- **Pattern:** event-sourced — Legends inserts an `xp_events` row and bumps `user_stats`. Reuse this exactly; don't invent a parallel XP system.

### Streaks — `streaks` (PK `user_id`)
- Columns: `current` (smallint), `last_date` (date), `updated_at`. **Empty (0 rows) — scaffolded, not yet live.**
- ⚠️ **Too minimal for the plan's mercy mechanics.** Weekend-pause + 1 auto-freeze/week needs extra state. **Action (P2-2):** additively add columns e.g. `freeze_available` (bool), `last_freeze_week` (text), `frozen_on` (date) — don't drop/rebuild.

### Weekly quiz — `weekly_quiz_attempts`
- `week_key` (`YYYY-MM-DD`), `subject`, `year_group` (`y11`|`y12`), `score`, `correct`, `total` (default 15), `answers` (jsonb).
- Already the basis for weekly leaderboards. Quick Game can write here, or we add `game_sessions` and aggregate — decide in P2.

### Funnel / monetisation (already complete — no Legends work needed)
`pilot_signups` (email capture), `subscriptions` (Stripe, tiers `free|core|plus|pro|coach`), `tutors`, `tutor_sessions`, `session_bookings`, `tutor_messages`.

### Privacy — `privacy_consents` (17 rows, live)
`consent_type`, `consented_at`, `withdrawn_at`. Combined with `user_profiles.is_over_15` + opt-in flags, the under-16 guardrail framework is **already real** — reuse it, don't rebuild.

---

## Already-built Phase 2 head start — Duel

Fully scaffolded (all empty, RLS on):
- `duel_challenges` — `challenger_id`/`opponent_id`, `subject`, `year_group`, `status` (`pending|active|complete|expired`), `question_ids` (jsonb), `expires_at`.
- `duel_answers` — `duel_id`, `answers` (jsonb), `score` (0–5). → **5-question duels.**
- `duel_elo` — PK (`user_id`,`subject`,`year_group`), `elo` (default 1200), `wins`, `losses`.

When we reach Phase 2, Duel is mostly DB-done — it just needs the question source + UI. **Note:** `duel_challenges.question_ids` already assumes a questions table with stable IDs that doesn't exist yet → reinforces that the question migration is the keystone for everything.

---

## ⚠️ Integration gotchas (must reconcile in Phase 0)

1. **No `questions` table exists.** Both the live `weekly_quiz_attempts` flow and the scaffolded Duel reference questions that aren't in the DB (banks are still JS files). **The Phase 0 question migration is the keystone the whole system is already waiting on.**

2. **Subject enums are inconsistent across tables — pick a canonical set and migrate the rest:**
   | Table | Allowed `subject` values |
   |---|---|
   | `xp_events` | biology, chemistry, physics, **maths**, science |
   | `weekly_quiz_attempts` | biology, chemistry, physics, maths-advanced, maths-standard |
   | `duel_challenges` | biology, chemistry, physics, maths-standard, maths-advanced |
   | **Legends needs** | biology, chemistry, physics, maths-standard, maths-advanced, **maths-ext1** |
   - **No table currently allows `maths-ext1`.** Phase 0 must extend these CHECK constraints to the canonical 6-subject set before Ext1 content can flow.

3. **RLS + anonymous Live-Class join.** Every table requires `auth.uid()`. The plan's "play before signup" (P1-2) means anonymous players can't write to `xp_events`/`weekly_quiz_attempts` directly. **Resolve in P1-2 via** Supabase anonymous auth, or server-side writes through an Edge Function (service role) that attaches XP on later signup.

---

## What this changes in the build plan

- **P0-1: done** (this doc).
- Less new work than estimated: alias system, privacy framework, XP/coins, and the entire Duel schema already exist.
- New Phase 0 sub-task: **reconcile subject CHECK constraints to the canonical 6** (folded into P0-4).
- New Phase 2 note: **extend `streaks` additively** for mercy mechanics (P2-2).
- New Phase 1 note: **decide the anonymous-write path** (P1-2).
