-- LOCAL synthetic schema reconstruction from approved structure-only catalog, 2026-10-18.
-- auth.users is an identity stub; roles/grants/RLS/inbound dependencies not exported.
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create table public.game_sessions (
 id uuid default gen_random_uuid() not null,
 code text not null,
 host_id uuid,
 subject text not null,
 year smallint,
 question_ids text[] not null,
 status text default 'lobby'::text not null,
 current_index smallint default '-1'::integer not null,
 question_started_at timestamp with time zone,
 per_question_seconds smallint default 15 not null,
 created_at timestamp with time zone default now() not null,
 expires_at timestamp with time zone default (now() + '06:00:00'::interval) not null,
 double_index smallint,
 constraint game_sessions_code_key UNIQUE (code),
 constraint game_sessions_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id),
 constraint game_sessions_pkey PRIMARY KEY (id),
 constraint game_sessions_status_check CHECK (status = ANY (ARRAY['lobby'::text, 'active'::text, 'complete'::text]))
);
create table public.game_players (
 id uuid default gen_random_uuid() not null,
 session_id uuid not null,
 user_id uuid,
 alias text not null,
 score integer default 0 not null,
 joined_at timestamp with time zone default now() not null,
 constraint game_players_pkey PRIMARY KEY (id),
 constraint game_players_session_id_fkey FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
 constraint game_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
create table public.game_answers (
 id uuid default gen_random_uuid() not null,
 session_id uuid not null,
 player_id uuid not null,
 question_index smallint not null,
 choice smallint not null,
 is_correct boolean not null,
 points integer default 0 not null,
 answered_at timestamp with time zone default now() not null,
 constraint game_answers_pkey PRIMARY KEY (id),
 constraint game_answers_player_id_fkey FOREIGN KEY (player_id) REFERENCES game_players(id) ON DELETE CASCADE,
 constraint game_answers_player_id_question_index_key UNIQUE (player_id, question_index),
 constraint game_answers_session_id_fkey FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);
CREATE INDEX game_players_session_idx ON public.game_players USING btree (session_id);
CREATE INDEX game_sessions_code_idx ON public.game_sessions USING btree (code);
