-- Leagues — a Duolingo-style cross-subject progression ladder on top of weekly XP.
-- 7 divisions (Bronze..Diamond). Each week, top ~30% of a division promote, 0-XP
-- members relegate. No pg_cron available, so rollover is LAZY: the first read each
-- week triggers a once-per-week guarded rollover (safe under concurrency).

create table if not exists public.league_members (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  division    smallint not null default 0,   -- 0 Bronze .. 6 Diamond
  joined_week text,
  last_result text,                          -- 'promoted' | 'relegated' | 'stayed'
  updated_at  timestamptz not null default now()
);
create table if not exists public.league_rollovers (
  week_key text primary key,
  ran_at   timestamptz not null default now()
);

alter table public.league_members   enable row level security;
alter table public.league_rollovers enable row level security;
do $$ begin
  -- Board is public-read (it's a leaderboard); opt-in is enforced in the board query.
  if not exists (select 1 from pg_policies where tablename='league_members' and policyname='league_members_read')
    then create policy league_members_read on public.league_members for select to anon, authenticated using (true); end if;
end $$;

-- Monday 00:00 Australia/Sydney for the current week (p_back weeks ago), as timestamptz.
create or replace function public._week_start_aest(p_back int default 0)
returns timestamptz language sql stable set search_path = public as $$
  select (date_trunc('week', timezone('Australia/Sydney', now())) - make_interval(weeks => p_back))
         at time zone 'Australia/Sydney';
$$;

-- Once-per-week promotion/relegation. Guarded by league_rollovers (idempotent).
create or replace function public._run_league_rollover()
returns void language plpgsql security definer set search_path = public as $$
declare v_week text := public._weekly_key();
begin
  insert into public.league_rollovers(week_key) values (v_week) on conflict do nothing;
  if not found then return; end if;  -- another call already ran this week

  with lastxp as (
    select m.user_id, m.division,
      coalesce((select sum(x.amount) from public.xp_events x
        where x.user_id = m.user_id
          and x.created_at >= public._week_start_aest(1)
          and x.created_at <  public._week_start_aest(0)), 0) as xp
    from public.league_members m
  ),
  ranked as (
    select user_id, division, xp,
      row_number() over (partition by division order by xp desc) as rn,
      count(*)     over (partition by division)                  as cnt
    from lastxp
  ),
  decided as (
    select user_id, division,
      case
        when xp > 0 and division < 6 and rn <= ceil(cnt * 0.30) then (division + 1)
        when xp = 0 and division > 0                            then (division - 1)
        else division end as new_div,
      case
        when xp > 0 and division < 6 and rn <= ceil(cnt * 0.30) then 'promoted'
        when xp = 0 and division > 0                            then 'relegated'
        else 'stayed' end as result
    from ranked
  )
  update public.league_members m
    set division = d.new_div, last_result = d.result, updated_at = now()
    from decided d where d.user_id = m.user_id;
end $$;

-- My league snapshot (auto-joins Bronze; triggers the weekly rollover lazily).
create or replace function public.get_my_league()
returns table(division smallint, week_xp bigint, rank int, member_count int,
              promote_cutoff int, last_result text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_div smallint; v_last text;
begin
  if v_uid is null then return; end if;
  perform public._run_league_rollover();
  insert into public.league_members(user_id, division, joined_week)
    values (v_uid, 0, public._weekly_key()) on conflict do nothing;
  select m.division, m.last_result into v_div, v_last from public.league_members m where m.user_id = v_uid;

  return query
  with members as (
    select m.user_id,
      coalesce((select sum(x.amount) from public.xp_events x
        where x.user_id = m.user_id and x.created_at >= public._week_start_aest(0)), 0) as wx
    from public.league_members m where m.division = v_div
  ),
  ranked as (select user_id, wx, row_number() over (order by wx desc) as rn, count(*) over () as cnt from members)
  select v_div,
         (select wx from members where user_id = v_uid)::bigint,
         coalesce((select rn from ranked where user_id = v_uid), 1)::int,
         (select cnt from ranked limit 1)::int,
         greatest(1, ceil((select cnt from ranked limit 1) * 0.30))::int,
         v_last;
end $$;

-- Board for my division (opted-in members + me), ranked by this week's XP.
create or replace function public.get_league_board()
returns table(rank int, name text, week_xp bigint, is_me boolean, avatar_style text, avatar_seed text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_div smallint;
begin
  if v_uid is null then return; end if;
  select m.division into v_div from public.league_members m where m.user_id = v_uid;
  if v_div is null then return; end if;

  return query
  with members as (
    select m.user_id,
      coalesce((select sum(x.amount) from public.xp_events x
        where x.user_id = m.user_id and x.created_at >= public._week_start_aest(0)), 0) as wx
    from public.league_members m where m.division = v_div
  )
  select (row_number() over (order by mem.wx desc))::int,
         coalesce(nullif(p.display_name,''),
                  case when p.codename is not null and p.handle_tag is not null
                       then p.codename || '#' || lpad(p.handle_tag::text,4,'0') end,
                  nullif(p.name,''), 'Legend'),
         mem.wx::bigint,
         (mem.user_id = v_uid),
         p.avatar_style, p.avatar_seed
  from members mem
  join public.user_profiles p on p.user_id = mem.user_id
  where p.leaderboard_opt_in = true or mem.user_id = v_uid
  order by mem.wx desc
  limit 50;
end $$;

grant execute on function public._week_start_aest(int), public._run_league_rollover(),
  public.get_my_league(), public.get_league_board() to anon, authenticated;
