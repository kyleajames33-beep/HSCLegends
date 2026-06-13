-- Knockout — self-driving battle-royale quiz.
-- No host needed: lobby auto-starts on a countdown once >=2 players; rounds
-- auto-advance when the timer expires (first client triggers; idempotent).

create table if not exists public.ko_rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  host_id          uuid references auth.users(id),
  subject          text not null,
  year             smallint not null,
  question_ids     text[] not null,
  status           text not null default 'lobby' check (status in ('lobby','active','finished')),
  round            smallint not null default -1,
  round_started_at timestamptz,
  per_q_seconds    smallint not null default 12,
  starts_at        timestamptz,
  is_public        boolean not null default true,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '3 hours'
);
create index if not exists ko_rooms_open_idx on public.ko_rooms (subject, year, status, is_public);

create table if not exists public.ko_players (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references public.ko_rooms(id) on delete cascade,
  user_id          uuid references auth.users(id),
  alias            text not null,
  alive            boolean not null default true,
  score            int not null default 0,
  eliminated_round smallint,
  joined_at        timestamptz not null default now()
);
create index if not exists ko_players_room_idx on public.ko_players (room_id);

create table if not exists public.ko_answers (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.ko_rooms(id) on delete cascade,
  player_id   uuid not null references public.ko_players(id) on delete cascade,
  round       smallint not null,
  choice      smallint not null,
  correct     boolean not null,
  points      int not null default 0,
  answered_at timestamptz not null default now(),
  unique (player_id, round)
);
create index if not exists ko_answers_round_idx on public.ko_answers (room_id, round);

alter table public.ko_rooms   enable row level security;
alter table public.ko_players enable row level security;
alter table public.ko_answers enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='ko_rooms' and policyname='ko_rooms_read')
    then create policy ko_rooms_read on public.ko_rooms for select to anon, authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='ko_players' and policyname='ko_players_read')
    then create policy ko_players_read on public.ko_players for select to anon, authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='ko_answers' and policyname='ko_answers_read')
    then create policy ko_answers_read on public.ko_answers for select to anon, authenticated using (true); end if;
end $$;
do $$ begin
  begin alter publication supabase_realtime add table public.ko_rooms;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ko_players; exception when duplicate_object then null; end;
end $$;

-- Create a room (reuses gen_game_code from the Live Class Game).
create or replace function public.ko_create(p_subject text, p_year smallint, p_count int default 14, p_public boolean default true)
returns table(code text, room_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_code text; v_id uuid; v_qids text[];
begin
  select array_agg(q.id) into v_qids from public.get_quiz_questions(p_subject, p_year, null, null::smallint, p_count, '{}') q;
  if v_qids is null or array_length(v_qids,1) < 1 then raise exception 'No questions for that selection'; end if;
  v_code := public.gen_game_code();
  insert into public.ko_rooms(code, host_id, subject, year, question_ids, is_public)
  values (v_code, auth.uid(), p_subject, p_year, v_qids, p_public) returning id into v_id;
  return query select v_code, v_id;
end $$;

-- Internal: add a player and arm the 20s auto-start once >=2 players are in.
create or replace function public._ko_add_player(p_room uuid, p_alias text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_cnt int;
begin
  insert into public.ko_players(room_id, user_id, alias)
  values (p_room, auth.uid(), left(trim(p_alias), 20)) returning id into v_pid;
  select count(*) into v_cnt from public.ko_players where room_id = p_room;
  if v_cnt >= 2 then
    update public.ko_rooms set starts_at = coalesce(starts_at, now() + interval '20 seconds')
    where id = p_room and status = 'lobby';
  end if;
  return v_pid;
end $$;

create or replace function public.ko_join(p_code text, p_alias text)
returns table(room_id uuid, player_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_room public.ko_rooms; v_pid uuid;
begin
  select * into v_room from public.ko_rooms where code = upper(p_code);
  if not found then raise exception 'Game not found'; end if;
  if v_room.status <> 'lobby' then raise exception 'Game already started'; end if;
  v_pid := public._ko_add_player(v_room.id, p_alias);
  return query select v_room.id, v_pid;
end $$;

-- Find an open public lobby (subject+year) that isn't about to start, else create one.
create or replace function public.ko_quick_join(p_subject text, p_year smallint, p_alias text)
returns table(room_id uuid, player_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_code text; v_pid uuid;
begin
  select r.id, r.code into v_room, v_code
  from public.ko_rooms r
  where r.subject = p_subject and r.year = p_year and r.status = 'lobby' and r.is_public
    and r.expires_at > now()
    and (r.starts_at is null or r.starts_at > now() + interval '4 seconds')
    and (select count(*) from public.ko_players p where p.room_id = r.id) < 60
  order by (select count(*) from public.ko_players p where p.room_id = r.id) desc, r.created_at desc
  limit 1;

  if v_room is null then
    select c.room_id, c.code into v_room, v_code from public.ko_create(p_subject, p_year, 14, true) c;
  end if;
  v_pid := public._ko_add_player(v_room, p_alias);
  return query select v_room, v_pid, v_code;
end $$;

-- Start (idempotent): lobby -> active once >=2 players. Called by any client when
-- the countdown elapses, or by the host.
create or replace function public.ko_start(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cnt int;
begin
  select count(*) into v_cnt from public.ko_players where room_id = p_room;
  if v_cnt < 2 then return; end if;
  update public.ko_rooms set status='active', round=0, round_started_at=now()
  where id = p_room and status='lobby';
end $$;

-- Current question (no answer leaked) + alive/total counts.
create or replace function public.ko_state(p_room uuid)
returns table(round smallint, total int, status text, stem text, options jsonb,
              round_started_at timestamptz, per_q_seconds smallint, starts_at timestamptz,
              alive int, players int)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select r.round, array_length(r.question_ids,1), r.status,
         q.stem, to_jsonb(q.options), r.round_started_at, r.per_q_seconds, r.starts_at,
         (select count(*)::int from public.ko_players p where p.room_id=r.id and p.alive),
         (select count(*)::int from public.ko_players p where p.room_id=r.id)
  from public.ko_rooms r
  left join public.questions q on r.round >= 0 and q.id = r.question_ids[r.round + 1]
  where r.id = p_room;
end $$;

-- Server-graded answer.
create or replace function public.ko_submit(p_player uuid, p_round smallint, p_choice smallint)
returns table(correct boolean, correct_index smallint, points int)
language plpgsql security definer set search_path = public as $$
declare v_r public.ko_rooms; v_pl public.ko_players; v_qid text; v_ci smallint; v_ok boolean; v_pts int; v_elapsed numeric;
begin
  select * into v_pl from public.ko_players where id = p_player;
  if not found then raise exception 'Unknown player'; end if;
  select * into v_r from public.ko_rooms where id = v_pl.room_id;
  if v_r.status <> 'active' or v_r.round <> p_round then raise exception 'Not the current question'; end if;
  if not v_pl.alive then raise exception 'You are out'; end if;
  if now() > v_r.round_started_at + (v_r.per_q_seconds || ' seconds')::interval then raise exception 'Too late'; end if;
  if exists (select 1 from public.ko_answers where player_id=p_player and round=p_round) then raise exception 'Already answered'; end if;

  v_qid := v_r.question_ids[p_round + 1];
  select q.correct_index into v_ci from public.questions q where q.id = v_qid;
  v_ok := (p_choice = v_ci);
  v_elapsed := extract(epoch from (now() - v_r.round_started_at));
  v_pts := case when v_ok then 100 + greatest(0, round((v_r.per_q_seconds - v_elapsed)/v_r.per_q_seconds*50))::int else 0 end;
  insert into public.ko_answers(room_id, player_id, round, choice, correct, points)
  values (v_r.id, p_player, p_round, p_choice, v_ok, v_pts);
  update public.ko_players set score = score + v_pts where id = p_player;
  return query select v_ok, v_ci, v_pts;
end $$;

-- Resolve a round: eliminate alive players who didn't answer correctly (unless
-- nobody did — a "lucky round"), then advance or finish. Idempotent + deadline-guarded.
create or replace function public.ko_advance(p_room uuid, p_round smallint)
returns void language plpgsql security definer set search_path = public as $$
declare v_r public.ko_rooms; v_total int; v_correct int; v_alive int; v_secs smallint;
begin
  select * into v_r from public.ko_rooms where id = p_room for update;
  if v_r.status <> 'active' or v_r.round <> p_round then return; end if;
  if now() < v_r.round_started_at + (v_r.per_q_seconds || ' seconds')::interval then return; end if;

  v_total := array_length(v_r.question_ids, 1);
  select count(*) into v_correct
  from public.ko_players p
  join public.ko_answers a on a.player_id = p.id and a.round = p_round and a.correct
  where p.room_id = p_room and p.alive;

  if v_correct > 0 then
    update public.ko_players p
    set alive = false, eliminated_round = p_round
    where p.room_id = p_room and p.alive
      and not exists (select 1 from public.ko_answers a where a.player_id = p.id and a.round = p_round and a.correct);
  end if;

  select count(*) into v_alive from public.ko_players where room_id = p_room and alive;

  if v_alive <= 1 or p_round + 1 >= v_total then
    update public.ko_rooms set status='finished' where id = p_room;
  else
    v_secs := greatest(7, (12 - (p_round + 1) / 2))::smallint;
    update public.ko_rooms set round = p_round + 1, round_started_at = now(), per_q_seconds = v_secs
    where id = p_room;
  end if;
end $$;

-- Final standings (winner first; later elimination ranks higher; then score).
create or replace function public.ko_results(p_room uuid)
returns table(rank bigint, alias text, score int, alive boolean, eliminated_round smallint, is_me boolean)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by p.alive desc, p.eliminated_round desc nulls first, p.score desc),
         p.alias, p.score, p.alive, p.eliminated_round, (p.user_id = auth.uid())
  from public.ko_players p
  where p.room_id = p_room
  order by p.alive desc, p.eliminated_round desc nulls first, p.score desc
  limit 50;
$$;

grant execute on function
  public.ko_create(text, smallint, int, boolean),
  public.ko_join(text, text),
  public.ko_quick_join(text, smallint, text),
  public.ko_start(uuid),
  public.ko_state(uuid),
  public.ko_submit(uuid, smallint, smallint),
  public.ko_advance(uuid, smallint),
  public.ko_results(uuid)
  to anon, authenticated;