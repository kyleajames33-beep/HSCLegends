-- LOCAL REVIEW PROPOSAL ONLY. Not registered as a Supabase migration.
-- Run only against the synthetic baseline in tests/fixtures/classroom-upgrade-baseline.sql.
-- Production approval, complete dependency/retention review, role design and
-- real migration generation are outstanding. No backend principal/grants here.
-- Does not implement ledger claims, issuance, API/auth or turn on the client.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
alter table public.game_players add constraint classroom_player_room_unique unique(id,session_id);
alter table public.game_answers add constraint classroom_answer_player_room_fkey
 foreign key(player_id,session_id) references public.game_players(id,session_id)
 on delete cascade not valid;
-- Validation must fail atomically for inconsistent legacy rows. Never repair them here.
alter table public.game_answers validate constraint classroom_answer_player_room_fkey;

create schema classroom_candidate_private;
revoke all on schema classroom_candidate_private from public,anon,authenticated;
create table classroom_candidate_private.question_sets (
 session_id uuid primary key references public.game_sessions(id) on delete cascade,
 payload json not null
);
create table classroom_candidate_private.guest_sessions (
 player_id uuid primary key, session_id uuid not null,
 secret_hash text not null unique check(secret_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null, revoked boolean not null default false,
 foreign key(player_id,session_id) references public.game_players(id,session_id) on delete cascade
);
create table classroom_candidate_private.receipts (
 player_id uuid not null, question_index smallint not null, payload json not null,
 primary key(player_id,question_index),
 foreign key(player_id,question_index) references public.game_answers(player_id,question_index) on delete cascade
);
-- Freeze accepted content while its parent exists. DELETE is deliberately not
-- blocked: verified legacy room/player cleanup cascades must keep working.
-- The eventual backend principal must have no direct DELETE or TRUNCATE privilege
-- on evidence tables. Trusted host cleanup/retention still requires independent review.
create function classroom_candidate_private.reject_evidence_update() returns trigger
 language plpgsql set search_path = pg_catalog as $$
begin raise exception 'immutable classroom evidence'; end $$;
create trigger question_set_immutable before update on classroom_candidate_private.question_sets
 for each row execute function classroom_candidate_private.reject_evidence_update();
create trigger receipt_immutable before update on classroom_candidate_private.receipts
 for each row execute function classroom_candidate_private.reject_evidence_update();
alter table classroom_candidate_private.question_sets enable row level security;
alter table classroom_candidate_private.guest_sessions enable row level security;
alter table classroom_candidate_private.receipts enable row level security;
revoke all on all tables in schema classroom_candidate_private from public,anon,authenticated;
revoke all on all functions in schema classroom_candidate_private from public,anon,authenticated;
commit;
