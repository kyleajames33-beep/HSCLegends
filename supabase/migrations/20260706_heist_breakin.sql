-- Heist redesign — "The Break-In" (docs/heist-redesign.md).
-- The quiz stays the engine: correct answers bank vault gold (team score) and
-- charge personal ENERGY. Energy is spent on interactive verbs:
--   RAID (60⚡)  — enter the enemy vault (WASD run, client-side skill), crack
--                 gold pads room by room, escape to bank a % of their vault.
--   SENTRY (30⚡)— place a single-use trap on your own floor (zoning).
--   SPOTLIGHT   — free active defense during an intruder alarm (mouse beam).
-- The old "every 4th round auto-steals" rule is removed (is_heist now always
-- false; old deployed clients degrade cleanly — no banner, no auto-steal).
--
-- Trust model: the raider's client judges hits (laser/sentry/spotlight) and
-- reports the outcome; THIS FILE is the economic boundary — energy costs,
-- cooldowns, concurrency caps, loot clamps, minimum raid duration and hard
-- expiry are all enforced here. Clients can lie about aim, not about gold.

-- ── Player economy columns ─────────────────────────────────────────────────
alter table public.heist_players
  add column if not exists energy  int not null default 0,
  add column if not exists stolen  int not null default 0,
  add column if not exists catches int not null default 0;

-- ── Raids (the alarm signal — in the realtime publication) ────────────────
create table if not exists public.heist_raids (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null,
  raider_id    uuid not null,
  raider_alias text not null default '',
  target_team  text not null check (target_team in ('a','b')),
  status       text not null default 'active' check (status in ('active','banked','caught','expired')),
  rooms_looted smallint not null default 0,
  loot         int not null default 0,
  caught_by    text, -- 'laser' | 'sentry' | 'spotlight' (colour for the callout)
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);
create index if not exists heist_raids_room_idx on public.heist_raids (room_id, status);
alter table public.heist_raids enable row level security;
drop policy if exists heist_raids_read on public.heist_raids;
create policy heist_raids_read on public.heist_raids for select to anon, authenticated using (true);
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'heist_raids') then
    alter publication supabase_realtime add table public.heist_raids;
  end if;
end $$;

-- ── Sentries ───────────────────────────────────────────────────────────────
create table if not exists public.heist_traps (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null,
  team      text not null check (team in ('a','b')),
  x         real not null,
  y         real not null,
  placed_by uuid not null,
  sprung    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists heist_traps_room_idx on public.heist_traps (room_id, team) where not sprung;
alter table public.heist_traps enable row level security;
drop policy if exists heist_traps_read on public.heist_traps;
create policy heist_traps_read on public.heist_traps for select to anon, authenticated using (true);

-- ── Season persistence (Master Thief board) ────────────────────────────────
create table if not exists public.heist_match_log (
  user_id  uuid not null,
  room_id  uuid not null,
  team     text not null,
  won      boolean not null default false,
  gold     int not null default 0,
  stolen   int not null default 0,
  catches  int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
alter table public.heist_match_log enable row level security;
drop policy if exists heist_match_log_read on public.heist_match_log;
create policy heist_match_log_read on public.heist_match_log for select to anon, authenticated using (true);

-- ── heist_submit: bank gold + charge energy (no more auto-steal) ───────────
-- Return type changes (adds energy) → drop + recreate.
drop function if exists public.heist_submit(uuid, smallint, smallint);
create function public.heist_submit(p_player uuid, p_round smallint, p_choice smallint)
returns table(correct boolean, correct_index smallint, points integer, stole boolean, energy integer)
language plpgsql security definer set search_path to 'public' as $$
declare v_r public.heist_rooms; v_pl public.heist_players; v_qid text; v_ci smallint;
        v_ok boolean; v_pts int; v_el numeric; v_frac numeric; v_gain int; v_energy int;
begin
  select pl.* into v_pl from public.heist_players pl where pl.id = p_player for update;
  if not found then raise exception 'Unknown player'; end if;
  select * into v_r from public.heist_rooms where id = v_pl.room_id;
  if v_r.status <> 'active' or v_r.round <> p_round then raise exception 'Not the current question'; end if;
  if now() > v_r.round_started_at + (v_r.per_q_seconds || ' seconds')::interval then raise exception 'Too late'; end if;
  if exists (select 1 from public.heist_answers a where a.player_id = p_player and a.round = p_round) then raise exception 'Already answered'; end if;

  v_qid := v_r.question_ids[p_round + 1];
  select q.correct_index into v_ci from public.questions q where q.id = v_qid;
  v_ok := (p_choice = v_ci);
  v_el := extract(epoch from (now() - v_r.round_started_at));
  v_frac := greatest(0, (v_r.per_q_seconds - v_el) / v_r.per_q_seconds);
  v_pts := case when v_ok then 50 + round(v_frac * 50)::int else 0 end;
  v_gain := case when v_ok then 20 + round(v_frac * 10)::int else 5 end;

  insert into public.heist_answers(room_id, player_id, round, choice, correct, points)
  values (v_r.id, p_player, p_round, p_choice, v_ok, v_pts);

  update public.heist_players
  set gold = gold + v_pts, energy = least(100, public.heist_players.energy + v_gain)
  where id = p_player
  returning public.heist_players.energy into v_energy;

  if v_ok then
    if v_pl.team = 'a' then update public.heist_rooms set gold_a = gold_a + v_pts where id = v_r.id;
    else update public.heist_rooms set gold_b = gold_b + v_pts where id = v_r.id; end if;
  end if;
  return query select v_ok, v_ci, v_pts, false, v_energy;
end $$;
grant execute on function public.heist_submit(uuid, smallint, smallint) to anon, authenticated;

-- ── heist_state: is_heist retired (always false); raid counts appended ─────
drop function if exists public.heist_state(uuid);
create function public.heist_state(p_room uuid)
returns table(round smallint, total integer, status text, stem text, options jsonb,
              round_started_at timestamptz, per_q_seconds smallint, starts_at timestamptz,
              is_heist boolean, gold_a integer, gold_b integer, players integer,
              raiders_a integer, raiders_b integer)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  return query
  select r.round, array_length(r.question_ids,1), r.status, q.stem, to_jsonb(q.options),
         r.round_started_at, r.per_q_seconds, r.starts_at,
         false, r.gold_a, r.gold_b,
         (select count(*)::int from public.heist_players p
            left join public.arena_presence pr on pr.player_id = p.id
            where p.room_id = r.id and coalesce(pr.last_seen, p.joined_at) > now() - interval '25 seconds'),
         (select count(*)::int from public.heist_raids rd
            where rd.room_id = r.id and rd.status = 'active' and rd.target_team = 'a'
              and rd.started_at > now() - interval '50 seconds'),
         (select count(*)::int from public.heist_raids rd
            where rd.room_id = r.id and rd.status = 'active' and rd.target_team = 'b'
              and rd.started_at > now() - interval '50 seconds')
  from public.heist_rooms r
  left join public.questions q on r.round >= 0 and q.id = r.question_ids[r.round + 1]
  where r.id = p_room;
end $$;
grant execute on function public.heist_state(uuid) to anon, authenticated;

-- ── Per-player snapshot (energy etc. after rejoin / resync) ────────────────
create or replace function public.heist_me(p_player uuid)
returns table(energy int, gold int, team text, stolen int, catches int, team_traps int)
language sql stable security definer set search_path to 'public' as $$
  select p.energy, p.gold, p.team, p.stolen, p.catches,
         (select count(*)::int from public.heist_traps t
          where t.room_id = p.room_id and t.team = p.team and not t.sprung)
  from public.heist_players p where p.id = p_player;
$$;
grant execute on function public.heist_me(uuid) to anon, authenticated;

-- ── Sentry placement ───────────────────────────────────────────────────────
-- Geometry contract with the client (lib/heist.ts HEIST_BOARD): board is
-- 100×100, entry zone is y>=82, gold pads at (20,74) (80,50) (50,20) with a
-- 10u placement exclusion so pads can't be camped point-blank.
create or replace function public.heist_place_trap(p_player uuid, p_x real, p_y real)
returns table(trap_id uuid, energy int)
language plpgsql security definer set search_path to 'public' as $$
declare v_pl public.heist_players; v_r public.heist_rooms; v_live int; v_id uuid; v_energy int;
begin
  select pl.* into v_pl from public.heist_players pl where pl.id = p_player for update;
  if not found then raise exception 'Unknown player'; end if;
  select * into v_r from public.heist_rooms where id = v_pl.room_id;
  if v_r.status <> 'active' then raise exception 'Game not active'; end if;
  if v_pl.energy < 30 then raise exception 'Not enough energy'; end if;
  if p_x < 3 or p_x > 97 or p_y < 3 or p_y > 97 then raise exception 'Out of bounds'; end if;
  if p_y >= 82 then raise exception 'Too close to the entry'; end if;
  if sqrt((p_x-20)^2 + (p_y-74)^2) < 10 or sqrt((p_x-80)^2 + (p_y-50)^2) < 10
     or sqrt((p_x-50)^2 + (p_y-20)^2) < 10 then raise exception 'Too close to a gold pad'; end if;
  select count(*) into v_live from public.heist_traps t
  where t.room_id = v_r.id and t.team = v_pl.team and not t.sprung;
  if v_live >= 6 then raise exception 'Sentry limit reached'; end if;

  update public.heist_players set energy = public.heist_players.energy - 30 where id = p_player
  returning public.heist_players.energy into v_energy;
  insert into public.heist_traps(room_id, team, x, y, placed_by)
  values (v_r.id, v_pl.team, p_x, p_y, p_player) returning id into v_id;
  return query select v_id, v_energy;
end $$;
grant execute on function public.heist_place_trap(uuid, real, real) to anon, authenticated;

create or replace function public.heist_get_traps(p_room uuid, p_team text)
returns table(id uuid, x real, y real, placed_by uuid)
language sql stable security definer set search_path to 'public' as $$
  select t.id, t.x, t.y, t.placed_by from public.heist_traps t
  where t.room_id = p_room and t.team = p_team and not t.sprung;
$$;
grant execute on function public.heist_get_traps(uuid, text) to anon, authenticated;

-- ── Raid lifecycle ─────────────────────────────────────────────────────────
create or replace function public.heist_raid_start(p_player uuid)
returns table(raid_id uuid, started_at timestamptz, target_team text, energy int, traps jsonb)
language plpgsql security definer set search_path to 'public' as $$
declare v_pl public.heist_players; v_r public.heist_rooms; v_target text; v_id uuid;
        v_ts timestamptz; v_energy int; v_traps jsonb;
begin
  select pl.* into v_pl from public.heist_players pl where pl.id = p_player for update;
  if not found then raise exception 'Unknown player'; end if;
  select * into v_r from public.heist_rooms where id = v_pl.room_id;
  if v_r.status <> 'active' then raise exception 'Game not active'; end if;

  -- Sweep abandoned raids (closed laptop lids must never wedge a match).
  update public.heist_raids rd set status = 'expired', ended_at = now()
  where rd.room_id = v_r.id and rd.status = 'active' and rd.started_at < now() - interval '50 seconds';

  if exists (select 1 from public.heist_raids rd where rd.raider_id = p_player and rd.status = 'active')
    then raise exception 'Already raiding'; end if;
  if exists (select 1 from public.heist_raids rd where rd.raider_id = p_player and rd.ended_at > now() - interval '8 seconds')
    then raise exception 'Catch your breath — raid again in a few seconds'; end if;
  if v_pl.energy < 60 then raise exception 'Not enough energy'; end if;

  v_target := case when v_pl.team = 'a' then 'b' else 'a' end;
  if (select count(*) from public.heist_raids rd
      where rd.room_id = v_r.id and rd.status = 'active' and rd.target_team = v_target) >= 3
    then raise exception 'Their vault is swarming — wait for the heat to die down'; end if;

  update public.heist_players set energy = public.heist_players.energy - 60 where id = p_player
  returning public.heist_players.energy into v_energy;
  insert into public.heist_raids(room_id, raider_id, raider_alias, target_team)
  values (v_r.id, p_player, v_pl.alias, v_target) returning id, heist_raids.started_at into v_id, v_ts;

  -- Static snapshot of the defenders' sentries: what you see is what can kill
  -- you (sentries placed mid-raid arm for the NEXT raid).
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y)), '[]'::jsonb)
  into v_traps from public.heist_traps t
  where t.room_id = v_r.id and t.team = v_target and not t.sprung;

  return query select v_id, v_ts, v_target, v_energy, v_traps;
end $$;
grant execute on function public.heist_raid_start(uuid) to anon, authenticated;

-- Outcome is client-reported; stakes are server-clamped:
--  * banked  — loot = 10/25/45% of the victim's CURRENT vault for 1/2/3 rooms
--              (min 5g/room, capped at the vault), and elapsed time must be
--              plausible (≥ 3s + 2s per room — no teleport grabs).
--  * caught  — the raiding team's vault pays 20g to the defenders; a valid
--              catcher gets +20 personal gold and a catch credit; a sentry
--              catch spends the sentry.
--  * expired — nothing moves (abort/timeout).
create or replace function public.heist_raid_end(
  p_raid uuid, p_player uuid, p_outcome text, p_rooms smallint default 0,
  p_catcher uuid default null, p_trap uuid default null, p_cause text default null)
returns table(outcome text, loot int, penalty int)
language plpgsql security definer set search_path to 'public' as $$
declare v_raid public.heist_raids; v_r public.heist_rooms; v_out text; v_el numeric;
        v_loot int := 0; v_pen int := 0; v_victim_gold int; v_pct int;
begin
  select rd.* into v_raid from public.heist_raids rd where rd.id = p_raid for update;
  if not found or v_raid.raider_id <> p_player then raise exception 'Unknown raid'; end if;
  if v_raid.status <> 'active' then return query select v_raid.status, v_raid.loot, 0; return; end if;
  select * into v_r from public.heist_rooms where id = v_raid.room_id for update;

  v_el := extract(epoch from (now() - v_raid.started_at));
  v_out := case when p_outcome in ('banked','caught','expired') then p_outcome else 'expired' end;
  if v_el > 50 or v_r.status <> 'active' then v_out := 'expired'; end if;

  if v_out = 'banked' then
    if p_rooms < 1 or p_rooms > 3 then raise exception 'Bad loot claim'; end if;
    if v_el < 3 + 2 * p_rooms then v_out := 'expired'; -- implausibly fast: void, no transfer
    else
      v_victim_gold := case when v_raid.target_team = 'a' then v_r.gold_a else v_r.gold_b end;
      v_pct := case p_rooms when 1 then 10 when 2 then 25 else 45 end;
      v_loot := least(v_victim_gold, greatest(5 * p_rooms, v_victim_gold * v_pct / 100));
      if v_raid.target_team = 'a' then
        update public.heist_rooms set gold_a = gold_a - v_loot, gold_b = gold_b + v_loot where id = v_r.id;
      else
        update public.heist_rooms set gold_b = gold_b - v_loot, gold_a = gold_a + v_loot where id = v_r.id;
      end if;
      update public.heist_players set gold = gold + v_loot, stolen = stolen + v_loot where id = p_player;
    end if;
  elsif v_out = 'caught' then
    -- Raiding team pays the insurance: victim vault +20, raider vault -20.
    if v_raid.target_team = 'a' then
      v_pen := least(20, v_r.gold_b);
      update public.heist_rooms set gold_b = gold_b - v_pen, gold_a = gold_a + v_pen where id = v_r.id;
    else
      v_pen := least(20, v_r.gold_a);
      update public.heist_rooms set gold_a = gold_a - v_pen, gold_b = gold_b + v_pen where id = v_r.id;
    end if;
    if p_catcher is not null then
      update public.heist_players pl set gold = pl.gold + 20, catches = pl.catches + 1
      where pl.id = p_catcher and pl.room_id = v_r.id and pl.team = v_raid.target_team;
    end if;
    if p_trap is not null then
      update public.heist_traps t set sprung = true
      where t.id = p_trap and t.room_id = v_r.id and t.team = v_raid.target_team;
    end if;
  end if;

  update public.heist_raids rd
  set status = v_out, ended_at = now(), loot = v_loot,
      rooms_looted = case when v_out = 'banked' then p_rooms else rd.rooms_looted end,
      caught_by = case when v_out = 'caught' then p_cause else null end
  where rd.id = p_raid;
  return query select v_out, v_loot, v_pen;
end $$;
grant execute on function public.heist_raid_end(uuid, uuid, text, smallint, uuid, uuid, text) to anon, authenticated;

-- ── Results: tell the story (stolen / catches appended) ────────────────────
drop function if exists public.heist_results(uuid);
create function public.heist_results(p_room uuid)
returns table(alias text, team text, gold integer, is_me boolean, stolen integer, catches integer)
language sql stable security definer set search_path to 'public' as $$
  select p.alias, p.team, p.gold, (p.user_id = auth.uid()), p.stolen, p.catches
  from public.heist_players p where p.room_id = p_room order by p.gold desc limit 50;
$$;
grant execute on function public.heist_results(uuid) to anon, authenticated;

-- ── Finish: unchanged XP payout + season match log ─────────────────────────
create or replace function public.heist_advance(p_room uuid, p_round smallint)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_r public.heist_rooms; v_total int; v_subj text; v_win text;
begin
  select * into v_r from public.heist_rooms where id = p_room for update;
  if v_r.status <> 'active' or v_r.round <> p_round then return; end if;
  if now() < v_r.round_started_at + (v_r.per_q_seconds || ' seconds')::interval then return; end if;
  v_total := array_length(v_r.question_ids, 1);

  if p_round + 1 >= v_total then
    update public.heist_rooms set status='finished' where id = p_room;
    update public.heist_raids rd set status='expired', ended_at=now()
    where rd.room_id = p_room and rd.status = 'active';
    v_win := case when v_r.gold_a > v_r.gold_b then 'a' when v_r.gold_b > v_r.gold_a then 'b' else null end;
    v_subj := case when v_r.subject in ('biology','chemistry','physics','maths','science','maths-standard','maths-advanced','maths-ext1') then v_r.subject else null end;
    insert into public.xp_events(user_id, reason_key, amount, kind, subject)
    select p.user_id, 'heist:'||p.id, 15 + (p.gold/20) + case when v_win = p.team then 50 else 0 end, 'xp', v_subj
    from public.heist_players p where p.room_id = p_room and p.user_id is not null;
    insert into public.user_stats(user_id, total_xp)
    select p.user_id, 15 + (p.gold/20) + case when v_win = p.team then 50 else 0 end
    from public.heist_players p where p.room_id = p_room and p.user_id is not null
    on conflict (user_id) do update set total_xp = public.user_stats.total_xp + excluded.total_xp, updated_at = now();
    insert into public.heist_match_log(user_id, room_id, team, won, gold, stolen, catches)
    select p.user_id, p_room, p.team, (v_win = p.team), p.gold, p.stolen, p.catches
    from public.heist_players p where p.room_id = p_room and p.user_id is not null
    on conflict (user_id, room_id) do nothing;
  else
    update public.heist_rooms set round = p_round + 1, round_started_at = now() where id = p_room;
  end if;
end $$;

-- ── Season leaderboard: Master Thieves ─────────────────────────────────────
create or replace function public.heist_leaderboard(p_days int default 90)
returns table(alias text, games int, wins int, stolen bigint, catches bigint, is_me boolean)
language sql stable security definer set search_path to 'public' as $$
  select
    (select hp.alias from public.heist_players hp
     where hp.user_id = m.user_id order by hp.joined_at desc limit 1),
    count(*)::int, count(*) filter (where m.won)::int,
    sum(m.stolen), sum(m.catches), (m.user_id = auth.uid())
  from public.heist_match_log m
  where m.created_at > now() - make_interval(days => p_days)
  group by m.user_id
  order by sum(m.stolen) desc, count(*) filter (where m.won) desc
  limit 20;
$$;
grant execute on function public.heist_leaderboard(int) to anon, authenticated;

-- ── Pacing: 18s questions leave room to raid between answers ───────────────
create or replace function public.heist_create(p_subject text, p_year smallint, p_count integer default 12, p_public boolean default true)
returns table(code text, room_id uuid)
language plpgsql security definer set search_path to 'public' as $$
declare v_code text; v_id uuid; v_qids text[];
begin
  select array_agg(q.id) into v_qids from public.get_quiz_questions(p_subject, p_year, null, null::smallint, p_count, '{}') q;
  if v_qids is null or array_length(v_qids,1) < 1 then raise exception 'No questions'; end if;
  v_code := public.gen_game_code();
  insert into public.heist_rooms(code, host_id, subject, year, question_ids, is_public, per_q_seconds)
  values (v_code, auth.uid(), p_subject, p_year, v_qids, p_public, 18) returning id into v_id;
  return query select v_code, v_id;
end $$;
