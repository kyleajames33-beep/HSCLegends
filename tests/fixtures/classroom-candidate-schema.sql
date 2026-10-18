-- LOCAL TEST FIXTURE ONLY. Not a production migration or complete schema dump.
-- Legacy columns/constraints below are a narrow subset of verified catalog data.
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create table public.game_sessions (
 id uuid primary key, host_id uuid references auth.users(id), status text not null
 check(status in ('lobby','active','complete')), current_index smallint not null,
 question_started_at timestamptz, per_question_seconds smallint not null,
 expires_at timestamptz not null, double_index smallint
);
create table public.game_players (
 id uuid primary key, session_id uuid not null references public.game_sessions(id),
 user_id uuid references auth.users(id), alias text not null, score integer not null default 0,
 unique(id,session_id) -- Proposed consistency constraint, not verified legacy baseline.
);
create table public.game_answers (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.game_sessions(id),
 player_id uuid not null references public.game_players(id), question_index smallint not null,
 choice smallint not null, is_correct boolean not null, points integer not null default 0,
 answered_at timestamptz not null default now(), unique(player_id,question_index),
 foreign key(player_id,session_id) references public.game_players(id,session_id) -- Proposed.
);
alter table game_sessions enable row level security;
alter table game_players enable row level security;
alter table game_answers enable row level security;
create policy game_sessions_read on game_sessions for select to anon,authenticated using(true);
create policy game_players_read on game_players for select to anon,authenticated using(true);
create policy game_answers_read on game_answers for select to anon,authenticated using(true);
revoke all on game_sessions,game_players,game_answers from public,anon,authenticated;

-- Proposed isolated sidecars, all private. No browser/backend grants are created.
create schema classroom_candidate_private;
revoke all on schema classroom_candidate_private from public,anon,authenticated;
create table classroom_candidate_private.question_sets (
 session_id uuid primary key references game_sessions(id), payload json not null
);
create table classroom_candidate_private.guest_sessions (
 player_id uuid primary key, session_id uuid not null, secret_hash text not null check(secret_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null, revoked boolean not null default false,
 foreign key(player_id,session_id) references game_players(id,session_id)
);
create table classroom_candidate_private.receipts (
 player_id uuid not null, question_index smallint not null, payload json not null,
 primary key(player_id,question_index),
 foreign key(player_id,question_index) references game_answers(player_id,question_index)
);
create table classroom_candidate_private.claims (
 player_id uuid primary key references game_players(id), user_id uuid not null references auth.users(id),
 awarded integer not null check(awarded >= 0)
);
-- Synthetic account total; does NOT model production user_stats/xp_events/limits.
create table classroom_candidate_private.test_xp (
 user_id uuid primary key references auth.users(id), amount integer not null check(amount >= 0)
);
create function classroom_candidate_private.immutable() returns trigger language plpgsql as $$
begin raise exception 'immutable candidate evidence'; end $$;
create trigger question_set_immutable before update or delete on classroom_candidate_private.question_sets
 for each row execute function classroom_candidate_private.immutable();
create trigger receipt_immutable before update or delete on classroom_candidate_private.receipts
 for each row execute function classroom_candidate_private.immutable();
create trigger claim_immutable before update or delete on classroom_candidate_private.claims
 for each row execute function classroom_candidate_private.immutable();
alter table classroom_candidate_private.question_sets enable row level security;
alter table classroom_candidate_private.guest_sessions enable row level security;
alter table classroom_candidate_private.receipts enable row level security;
alter table classroom_candidate_private.claims enable row level security;
alter table classroom_candidate_private.test_xp enable row level security;
revoke all on all tables in schema classroom_candidate_private from public,anon,authenticated;
revoke all on all functions in schema classroom_candidate_private from public,anon,authenticated;
