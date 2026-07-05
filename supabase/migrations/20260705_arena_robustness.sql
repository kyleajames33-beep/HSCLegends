-- Foundation C — live-game robustness for Knockout / Heist / Live Class.
-- 1. Presence: arena_presence + arena_heartbeat (clients beat every ~10s;
--    "present" = seen in the last 25s). Deliberately NOT in the realtime
--    publication so heartbeats don't trigger subscriber re-syncs.
-- 2. Late-join: ko_join / heist_join / join_game accept in-progress games.
-- 3. Drop recovery: ko_rejoin / heist_rejoin / live_rejoin restore a player
--    by (code, alias) — score/team/alive state comes back with the player row.
-- 4. Bugfix: ko_advance shield NULL-trap — a player HOLDING an unused shield
--    could never be eliminated (powerup_used_round IS NULL made the NOT(...)
--    clause NULL). Found via a 3-client browser simulation on 2026-07-04.
-- Lobby counts everywhere switch to present-only players, so disconnected
-- players stop lingering in counts. Elimination/scoring semantics unchanged;
-- disconnected Knockout players still die organically by not answering.

-- ── 1. Presence ──────────────────────────────────────────────────────────

create table if not exists public.arena_presence (
  player_id uuid primary key,
  room_id uuid not null,
  mode text not null check (mode in ('knockout','heist','live')),
  last_seen timestamptz not null default now()
);
create index if not exists arena_presence_room_idx on public.arena_presence (room_id);
alter table public.arena_presence enable row level security;
drop policy if exists "arena_presence public read" on public.arena_presence;
create policy "arena_presence public read" on public.arena_presence for select using (true);
-- No insert/update policies: writes go through arena_heartbeat only.

-- Player heartbeat. Validates the player id against the mode's table and
-- derives room_id server-side (client can't spoof presence for others' rooms).
create or replace function public.arena_heartbeat(p_mode text, p_player uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_room uuid;
begin
  if p_mode = 'knockout' then
    select room_id into v_room from public.ko_players where id = p_player;
  elsif p_mode = 'heist' then
    select room_id into v_room from public.heist_players where id = p_player;
  elsif p_mode = 'live' then
    select session_id into v_room from public.game_players where id = p_player;
  else
    raise exception 'Unknown mode';
  end if;
  if v_room is null then raise exception 'Unknown player'; end if;
  insert into public.arena_presence(player_id, room_id, mode, last_seen)
  values (p_player, v_room, p_mode, now())
  on conflict (player_id) do update set last_seen = now();
end $$;

-- Presence list for a room (host UI: grey out disconnected players).
create or replace function public.arena_presences(p_room uuid)
returns table(player_id uuid, last_seen timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select a.player_id, a.last_seen from public.arena_presence a where a.room_id = p_room;
$$;

-- ── 2 + 3. Knockout ──────────────────────────────────────────────────────

-- players count = present only (last_seen or join within 25s).
create or replace function public.ko_state(p_room uuid)
returns table(round smallint, total integer, status text, stem text, options jsonb,
              round_started_at timestamptz, per_q_seconds smallint, starts_at timestamptz,
              alive integer, players integer)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  return query
  select r.round, array_length(r.question_ids,1), r.status,
         q.stem, to_jsonb(q.options), r.round_started_at, r.per_q_seconds, r.starts_at,
         (select count(*)::int from public.ko_players p where p.room_id=r.id and p.alive),
         (select count(*)::int from public.ko_players p
            left join public.arena_presence pr on pr.player_id = p.id
            where p.room_id=r.id and coalesce(pr.last_seen, p.joined_at) > now() - interval '25 seconds')
  from public.ko_rooms r
  left join public.questions q on r.round >= 0 and q.id = r.question_ids[r.round + 1]
  where r.id = p_room;
end $$;

-- Auto-start arming counts present players only (ghost lobby rows can't arm a start).
create or replace function public._ko_add_player(p_room uuid, p_alias text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_pid uuid; v_cnt int;
begin
  insert into public.ko_players(room_id, user_id, alias)
  values (p_room, auth.uid(), left(trim(p_alias), 20)) returning id into v_pid;
  select count(*) into v_cnt from public.ko_players p
    left join public.arena_presence pr on pr.player_id = p.id
    where p.room_id = p_room and coalesce(pr.last_seen, p.joined_at) > now() - interval '25 seconds';
  if v_cnt >= 2 then
    update public.ko_rooms set starts_at = coalesce(starts_at, now() + interval '20 seconds')
    where id = p_room and status = 'lobby';
  end if;
  return v_pid;
end $$;

-- Late-join: joining an active game is allowed (you enter alive at the current
-- round; the mid-round grace in ko_advance means the round in progress can't
-- eliminate you). Finished/expired games still reject.
create or replace function public.ko_join(p_code text, p_alias text)
returns table(room_id uuid, player_id uuid)
language plpgsql security definer set search_path to 'public' as $$
declare v_room public.ko_rooms; v_pid uuid; v_cnt int;
begin
  select * into v_room from public.ko_rooms where code = upper(p_code);
  if not found or v_room.expires_at < now() then raise exception 'Game not found'; end if;
  if v_room.status = 'finished' then raise exception 'Game already finished'; end if;
  select count(*) into v_cnt from public.ko_players p where p.room_id = v_room.id;
  if v_cnt >= 60 then raise exception 'Game is full'; end if;
  v_pid := public._ko_add_player(v_room.id, p_alias);
  return query select v_room.id, v_pid;
end $$;

-- ko_advance: shield NULL-trap fixed (coalesce) + mid-round joiners get grace
-- for the round they joined during. Everything else identical to the deployed
-- version (see 20260622035416_knockout_powerups.sql).
create or replace function public.ko_advance(p_room uuid, p_round smallint)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_r public.ko_rooms; v_total int; v_correct int; v_alive int; v_secs smallint; v_subj text;
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
      and not exists (select 1 from public.ko_answers a where a.player_id = p.id and a.round = p_round and a.correct)
      and not (p.powerup = 'shield' and coalesce(p.powerup_used_round, -1) = p_round)
      and p.joined_at < v_r.round_started_at; -- late-joiner grace for the round they entered
  end if;

  select count(*) into v_alive from public.ko_players where room_id = p_room and alive;

  if v_alive <= 1 or p_round + 1 >= v_total then
    update public.ko_rooms set status='finished' where id = p_room;
    v_subj := case when v_r.subject in
      ('biology','chemistry','physics','maths','science','maths-standard','maths-advanced','maths-ext1')
      then v_r.subject else null end;
    insert into public.xp_events(user_id, reason_key, amount, kind, subject)
    select p.user_id, 'knockout:' || p.id,
           15 + coalesce(p.eliminated_round + 1, v_total) * 8 + case when p.alive then 70 else 0 end,
           'xp', v_subj
    from public.ko_players p where p.room_id = p_room and p.user_id is not null;
    insert into public.user_stats(user_id, total_xp)
    select p.user_id, 15 + coalesce(p.eliminated_round + 1, v_total) * 8 + case when p.alive then 70 else 0 end
    from public.ko_players p where p.room_id = p_room and p.user_id is not null
    on conflict (user_id) do update set total_xp = public.user_stats.total_xp + excluded.total_xp, updated_at = now();
  else
    v_secs := greatest(7, (12 - (p_round + 1) / 2))::smallint;
    update public.ko_rooms set round = p_round + 1, round_started_at = now(), per_q_seconds = v_secs
    where id = p_room;
  end if;
end $$;

-- Drop recovery: refresh/crash → get your player row (score, alive) back.
-- Matches by alias within the newest live room for the code; prefers a row
-- owned by the caller's auth.uid() when signed in.
create or replace function public.ko_rejoin(p_code text, p_alias text)
returns table(room_id uuid, player_id uuid, alive boolean, score int)
language plpgsql security definer set search_path to 'public' as $$
declare v_room public.ko_rooms;
begin
  select * into v_room from public.ko_rooms
  where code = upper(p_code) and expires_at > now() and status <> 'finished';
  if not found then raise exception 'Game not found'; end if;
  return query
  select v_room.id, p.id, p.alive, p.score
  from public.ko_players p
  where p.room_id = v_room.id and lower(p.alias) = lower(left(trim(p_alias), 20))
  order by (p.user_id is not null and p.user_id = auth.uid()) desc, p.joined_at desc
  limit 1;
end $$;

-- ── 2 + 3. Heist ─────────────────────────────────────────────────────────

-- players count = present only.
create or replace function public.heist_state(p_room uuid)
returns table(round smallint, total integer, status text, stem text, options jsonb,
              round_started_at timestamptz, per_q_seconds smallint, starts_at timestamptz,
              is_heist boolean, gold_a integer, gold_b integer, players integer)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  return query
  select r.round, array_length(r.question_ids,1), r.status, q.stem, to_jsonb(q.options),
         r.round_started_at, r.per_q_seconds, r.starts_at,
         (r.round >= 0 and (r.round + 1) % 4 = 0), r.gold_a, r.gold_b,
         (select count(*)::int from public.heist_players p
            left join public.arena_presence pr on pr.player_id = p.id
            where p.room_id=r.id and coalesce(pr.last_seen, p.joined_at) > now() - interval '25 seconds')
  from public.heist_rooms r
  left join public.questions q on r.round >= 0 and q.id = r.question_ids[r.round + 1]
  where r.id = p_room;
end $$;

-- Auto-start arming counts present players only. Team balance still uses all
-- rows (harmless: worst case a team is briefly uneven).
create or replace function public._heist_add_player(p_room uuid, p_alias text)
returns table(player_id uuid, team text)
language plpgsql security definer set search_path to 'public' as $$
declare v_a int; v_b int; v_team text; v_pid uuid; v_cnt int;
begin
  select count(*) filter (where p.team='a'), count(*) filter (where p.team='b') into v_a, v_b
  from public.heist_players p where p.room_id = p_room;
  v_team := case when v_a <= v_b then 'a' else 'b' end;
  insert into public.heist_players(room_id, user_id, alias, team)
  values (p_room, auth.uid(), left(trim(p_alias),20), v_team) returning id into v_pid;
  select count(*) into v_cnt from public.heist_players p
    left join public.arena_presence pr on pr.player_id = p.id
    where p.room_id = p_room and coalesce(pr.last_seen, p.joined_at) > now() - interval '25 seconds';
  if v_cnt >= 2 then
    update public.heist_rooms set starts_at = coalesce(starts_at, now() + interval '20 seconds')
    where id = p_room and status='lobby';
  end if;
  return query select v_pid, v_team;
end $$;

-- Late-join: active heists accept new players (they start banking from the
-- current round). Finished/expired reject.
create or replace function public.heist_join(p_code text, p_alias text)
returns table(room_id uuid, player_id uuid, team text)
language plpgsql security definer set search_path to 'public' as $$
declare v_room public.heist_rooms; v_pid uuid; v_team text; v_cnt int;
begin
  select * into v_room from public.heist_rooms where code = upper(p_code);
  if not found or v_room.expires_at < now() then raise exception 'Game not found'; end if;
  if v_room.status = 'finished' then raise exception 'Game already finished'; end if;
  select count(*) into v_cnt from public.heist_players p where p.room_id = v_room.id;
  if v_cnt >= 40 then raise exception 'Game is full'; end if;
  select a.player_id, a.team into v_pid, v_team from public._heist_add_player(v_room.id, p_alias) a;
  return query select v_room.id, v_pid, v_team;
end $$;

-- Drop recovery for Heist (gold + team come back with the player row).
create or replace function public.heist_rejoin(p_code text, p_alias text)
returns table(room_id uuid, player_id uuid, team text, gold int)
language plpgsql security definer set search_path to 'public' as $$
declare v_room public.heist_rooms;
begin
  select * into v_room from public.heist_rooms
  where code = upper(p_code) and expires_at > now() and status <> 'finished';
  if not found then raise exception 'Game not found'; end if;
  return query
  select v_room.id, p.id, p.team, p.gold
  from public.heist_players p
  where p.room_id = v_room.id and lower(p.alias) = lower(left(trim(p_alias), 20))
  order by (p.user_id is not null and p.user_id = auth.uid()) desc, p.joined_at desc
  limit 1;
end $$;

-- ── 2 + 3. Live Class Game ───────────────────────────────────────────────

-- Late-join: students can join an in-progress class game (status='active').
-- Completed/expired sessions reject. Return shape unchanged.
create or replace function public.join_game(p_code text, p_alias text)
returns table(session_id uuid, player_id uuid, status text)
language plpgsql security definer set search_path to 'public' as $$
declare v_session public.game_sessions; v_pid uuid;
begin
  select * into v_session from public.game_sessions where code = upper(p_code);
  if not found or v_session.expires_at < now() then raise exception 'Game not found'; end if;
  if v_session.status = 'complete' then raise exception 'Game already finished'; end if;
  insert into public.game_players(session_id, user_id, alias)
  values (v_session.id, auth.uid(), left(trim(p_alias), 20)) returning id into v_pid;
  return query select v_session.id, v_pid, v_session.status;
end $$;

-- Drop recovery for Live Class (score comes back with the player row).
create or replace function public.live_rejoin(p_code text, p_alias text)
returns table(session_id uuid, player_id uuid, status text, score int)
language plpgsql security definer set search_path to 'public' as $$
declare v_session public.game_sessions;
begin
  -- Qualify columns: the OUT param "status" collides with game_sessions.status.
  select * into v_session from public.game_sessions g
  where g.code = upper(p_code) and g.expires_at > now() and g.status <> 'complete';
  if not found then raise exception 'Game not found'; end if;
  return query
  select v_session.id, p.id, v_session.status, p.score
  from public.game_players p
  where p.session_id = v_session.id and lower(p.alias) = lower(left(trim(p_alias), 20))
  order by (p.user_id is not null and p.user_id = auth.uid()) desc, p.joined_at desc
  limit 1;
end $$;

-- Host answer-count: denominator = present players (ghosts don't hold the
-- projector at "18/30 answered" forever).
create or replace function public.live_answer_count(p_session uuid, p_index smallint)
returns table(answered int, total int, correct int)
language sql stable security definer set search_path to 'public' as $$
  select
    (select count(*)::int from public.game_answers a where a.session_id = p_session and a.question_index = p_index),
    (select count(*)::int from public.game_players p
       left join public.arena_presence pr on pr.player_id = p.id
       where p.session_id = p_session and coalesce(pr.last_seen, p.joined_at) > now() - interval '25 seconds'),
    (select count(*)::int from public.game_answers a where a.session_id = p_session and a.question_index = p_index and a.is_correct);
$$;

-- ── Grants ───────────────────────────────────────────────────────────────
grant execute on function
  public.arena_heartbeat(text, uuid),
  public.arena_presences(uuid),
  public.ko_rejoin(text, text),
  public.heist_rejoin(text, text),
  public.live_rejoin(text, text)
to anon, authenticated;
