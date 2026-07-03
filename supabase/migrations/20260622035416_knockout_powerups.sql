-- Knockout one-use powerups: Shield (survive a wrong answer) / Double (2x points).
alter table public.ko_players add column if not exists powerup text;
alter table public.ko_players add column if not exists powerup_used_round int;

-- Returns the player's powerup, drawing a random one on first call.
create or replace function public.ko_powerup(p_player uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v text;
begin
  update public.ko_players set powerup = (array['shield','double'])[1 + floor(random()*2)::int]
    where id = p_player and powerup is null;
  select powerup into v from public.ko_players where id = p_player;
  return v;
end $$;
grant execute on function public.ko_powerup(uuid) to anon, authenticated;

-- Activate the held powerup for the current round (one-time).
create or replace function public.ko_use_powerup(p_player uuid, p_round smallint)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_pu text; v_used int;
begin
  select powerup, powerup_used_round into v_pu, v_used from public.ko_players where id = p_player for update;
  if v_pu is null or v_used is not null then return false; end if;
  update public.ko_players set powerup_used_round = p_round where id = p_player;
  return true;
end $$;
grant execute on function public.ko_use_powerup(uuid, smallint) to anon, authenticated;

-- ko_submit: identical, plus Double doubles points.
CREATE OR REPLACE FUNCTION public.ko_submit(p_player uuid, p_round smallint, p_choice smallint)
 RETURNS TABLE(correct boolean, correct_index smallint, points integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  if v_pl.powerup = 'double' and v_pl.powerup_used_round = p_round then v_pts := v_pts * 2; end if;
  insert into public.ko_answers(room_id, player_id, round, choice, correct, points)
  values (v_r.id, p_player, p_round, p_choice, v_ok, v_pts);
  update public.ko_players set score = score + v_pts where id = p_player;
  return query select v_ok, v_ci, v_pts;
end $function$;

-- ko_advance: identical, plus Shield-active players are NOT eliminated.
CREATE OR REPLACE FUNCTION public.ko_advance(p_room uuid, p_round smallint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
      and not (p.powerup = 'shield' and p.powerup_used_round = p_round);
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
end $function$;