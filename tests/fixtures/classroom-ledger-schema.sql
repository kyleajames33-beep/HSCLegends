-- TEST FIXTURE ONLY. Extend ../database/fixture-schema.sql inside an in-memory
-- PGlite instance. This is NOT a deployable migration or full production export.
-- user_profiles is a deliberately minimal identity stub, NOT a real profile.
create table public.user_profiles (user_id uuid primary key references auth.users(id));
-- Test projection of the verified claim function's room-subject input.
alter table public.game_sessions add column subject text;

-- Catalog-confirmed XP contract; unrelated user_profiles dependencies omitted.
create table public.xp_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.user_profiles(user_id) on delete cascade,
 reason_key text not null, amount integer not null check(amount >= 0),
 kind text not null default 'xp' check(kind in ('xp', 'bonus_coin')),
 subject text check(subject is null or subject in
   ('biology', 'chemistry', 'physics', 'maths', 'science', 'maths-standard', 'maths-advanced', 'maths-ext1')),
 created_at timestamptz not null default now(),
 unique(user_id, reason_key)
);
create table public.user_stats (
 user_id uuid primary key references public.user_profiles(user_id) on delete cascade,
 total_xp bigint not null default 0,
 coins bigint not null default 0,
 updated_at timestamptz not null default now()
);
-- Proposed candidate index for player-reason reconciliation across destinations;
-- not asserted to exist in the verified production catalog.
create index candidate_xp_events_reason_lookup on public.xp_events(reason_key);

-- Proposed immutable global player claim. Separate from the player's user_id.
create schema classroom_ledger_candidate_private;
create table classroom_ledger_candidate_private.claims (
 player_id uuid primary key,
 session_id uuid not null,
 user_id uuid not null references public.user_profiles(user_id),
 event_id uuid not null unique references public.xp_events(id),
 awarded integer not null check(awarded >= 0),
 reason_key text not null check(reason_key = 'live_game:' || player_id::text),
 kind text not null check(kind = 'xp'),
 subject text check(subject is null or subject in
   ('biology', 'chemistry', 'physics', 'maths', 'science', 'maths-standard', 'maths-advanced', 'maths-ext1')),
 disposition text not null check(disposition in ('awarded', 'reconciled')),
 created_at timestamptz not null default now(),
 foreign key(player_id, session_id) references public.game_players(id, session_id)
);
create trigger ledger_claim_immutable before update or delete
 on classroom_ledger_candidate_private.claims
 for each row execute function classroom_candidate_private.immutable();

-- Local fixture containment only. No browser/backend grants are added.
alter table public.user_profiles enable row level security;
alter table public.xp_events enable row level security;
alter table public.user_stats enable row level security;
alter table classroom_ledger_candidate_private.claims enable row level security;
revoke all on public.user_profiles, public.xp_events, public.user_stats from public, anon, authenticated;
revoke all on schema classroom_ledger_candidate_private from public, anon, authenticated;
revoke all on all tables in schema classroom_ledger_candidate_private from public, anon, authenticated;
