alter table public.heist_players add column if not exists powerup_used_round int;

create or replace function public.heist_use_powerup(p_player uuid, p_round smallint)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_used int;
begin
  select powerup_used_round into v_used from public.heist_players where id = p_player for update;
  if v_used is not null then return false; end if;
  update public.heist_players set powerup_used_round = p_round where id = p_player;
  return true;
end $$;
grant execute on function public.heist_use_powerup(uuid, smallint) to anon, authenticated;

create or replace function public.heist_submit(p_player uuid, p_round smallint, p_choice smallint)
returns table(correct boolean, correct_index smallint, points integer, stole boolean)
language plpgsql security definer set search_path to 'public' as $$
declare v_r public.heist_rooms; v_pl public.heist_players; v_qid text; v_ci smallint; v_ok boolean; v_pts int; v_el numeric; v_heist boolean;
begin
  select pl.* into v_pl from public.heist_players pl where pl.id = p_player;
  if not found then raise exception 'Unknown player'; end if;
  select * into v_r from public.heist_rooms where id = v_pl.room_id;
  if v_r.status <> 'active' or v_r.round <> p_round then raise exception 'Not the current question'; end if;
  if now() > v_r.round_started_at + (v_r.per_q_seconds || ' seconds')::interval then raise exception 'Too late'; end if;
  if exists (select 1 from public.heist_answers where player_id=p_player and round=p_round) then raise exception 'Already answered'; end if;

  v_qid := v_r.question_ids[p_round + 1];
  select q.correct_index into v_ci from public.questions q where q.id = v_qid;
  v_ok := (p_choice = v_ci);
  v_el := extract(epoch from (now() - v_r.round_started_at));
  v_heist := ((p_round + 1) % 4 = 0);
  v_pts := case when v_ok then 50 + greatest(0, round((v_r.per_q_seconds - v_el)/v_r.per_q_seconds*50))::int else 0 end;
  -- Raid powerup: doubles a heist-round haul (steal 2x) on the round it's activated
  if v_ok and v_heist and v_pl.powerup_used_round = p_round then v_pts := v_pts * 2; end if;

  insert into public.heist_answers(room_id, player_id, round, choice, correct, points)
  values (v_r.id, p_player, p_round, p_choice, v_ok, v_pts);

  if v_ok then
    update public.heist_players set gold = gold + v_pts where id = p_player;
    if v_heist then
      if v_pl.team = 'a' then update public.heist_rooms set gold_a = gold_a + v_pts, gold_b = greatest(0, gold_b - v_pts) where id = v_r.id;
      else update public.heist_rooms set gold_b = gold_b + v_pts, gold_a = greatest(0, gold_a - v_pts) where id = v_r.id; end if;
    else
      if v_pl.team = 'a' then update public.heist_rooms set gold_a = gold_a + v_pts where id = v_r.id;
      else update public.heist_rooms set gold_b = gold_b + v_pts where id = v_r.id; end if;
    end if;
  end if;
  return query select v_ok, v_ci, v_pts, (v_ok and v_heist);
end $$;