-- Streak Freeze fix + same-day streak repair.
--
-- 1) Bought freezes actually work. `streaks.freezes` (150 ✨ each, cap 5) was
--    sold by buy_streak_freeze() but never spent: record_daily_quiz and
--    record_quick_game only knew the free weekly auto-freeze. Missed weekdays
--    are now covered by the weekly freeze first, then by bought freezes.
-- 2) Repair. When a streak of 2+ breaks, the student can win it back the same
--    day (Sydney time) by answering 20 questions. Once per 14 days, free, and
--    never sold for Sparks.
-- 3) The streak screen gets a short history (active + frozen days).
--
-- Unchanged: weekends never break a streak (only missed Mon–Fri count), and the
-- free weekly freeze still covers one missed weekday per ISO week.
-- Note: hscscience.com.au's record_study_action also writes public.streaks with
-- its own calendar-day rule; it is not changed here and ignores these columns.

alter table public.streaks
  add column if not exists broken_streak  smallint,
  add column if not exists broken_on      date,
  add column if not exists last_repair_on date,
  add column if not exists active_days    date[] not null default '{}',
  add column if not exists frozen_days    date[] not null default '{}';

-- Keep the last n entries of a date array (history columns stay small).
create or replace function public._tail_dates(p_arr date[], p_n int)
returns date[] language sql immutable set search_path = public as $$
  select coalesce(p_arr[greatest(cardinality(p_arr) - p_n + 1, 1):], '{}');
$$;

-- ---------------------------------------------------------------------------
-- The one streak-advance rule, shared by record_daily_quiz + record_quick_game.
-- INTERNAL: takes a user id, so it must never be callable by clients.
-- ---------------------------------------------------------------------------
create or replace function public._advance_streak(p_uid uuid)
returns table(o_streak int, o_event text)
language plpgsql security definer set search_path = public as $$
declare
  v_today  date := (now() at time zone 'Australia/Sydney')::date;
  v_week   text := to_char((now() at time zone 'Australia/Sydney')::date, 'IYYY-IW');
  s        public.streaks%rowtype;
  v_missed date[];
  v_weekly int;
  v_stock  int;
begin
  select * into s from public.streaks where user_id = p_uid for update;

  if not found then
    insert into public.streaks (user_id, current, last_date, active_days)
      values (p_uid, 1, v_today, array[v_today]);
    return query select 1, 'started'::text; return;
  end if;

  -- A row can exist with no play yet (bought a freeze first).
  if s.last_date is null then
    update public.streaks set current = 1, last_date = v_today,
      active_days = array[v_today], updated_at = now()
    where user_id = p_uid;
    return query select 1, 'started'::text; return;
  end if;

  if s.last_date >= v_today then
    return query select coalesce(s.current, 0)::int, 'already'::text; return;
  end if;

  select coalesce(array_agg(d::date order by d), '{}') into v_missed
  from generate_series(s.last_date + 1, v_today - 1, interval '1 day') d
  where extract(isodow from d) <= 5;

  if cardinality(v_missed) = 0 then
    update public.streaks set current = coalesce(s.current, 0) + 1, last_date = v_today,
      active_days = public._tail_dates(active_days || v_today, 21), updated_at = now()
    where user_id = p_uid;
    return query select coalesce(s.current, 0) + 1, 'extended'::text; return;
  end if;

  -- Weekly auto-freeze first, then bought freezes, one per missed weekday.
  v_weekly := case when s.last_freeze_week is distinct from v_week then 1 else 0 end;
  v_stock  := greatest(cardinality(v_missed) - v_weekly, 0);

  if v_stock <= coalesce(s.freezes, 0) then
    update public.streaks set
      current          = coalesce(s.current, 0) + 1,
      last_date        = v_today,
      freezes          = coalesce(s.freezes, 0) - v_stock,
      last_freeze_week = case when v_weekly = 1 then v_week else last_freeze_week end,
      frozen_days      = public._tail_dates(frozen_days || v_missed, 21),
      active_days      = public._tail_dates(active_days || v_today, 21),
      updated_at       = now()
    where user_id = p_uid;
    return query select coalesce(s.current, 0) + 1, 'freeze_used'::text; return;
  end if;

  -- Not enough cover: reset, and open a repair window for streaks worth saving.
  update public.streaks set
    current       = 1,
    last_date     = v_today,
    broken_streak = case when coalesce(s.current, 0) >= 2 then s.current else null end,
    broken_on     = case when coalesce(s.current, 0) >= 2 then v_today else null end,
    active_days   = public._tail_dates(active_days || v_today, 21),
    updated_at    = now()
  where user_id = p_uid;
  return query select 1, 'reset'::text;
end $$;

revoke all on function public._advance_streak(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- record_daily_quiz / record_quick_game: same bodies as live, with the inline
-- streak block replaced by _advance_streak().
-- ---------------------------------------------------------------------------
create or replace function public.record_daily_quiz(p_subject text, p_year smallint, p_correct integer, p_total integer)
returns table(xp_awarded integer, total_xp bigint, streak integer, streak_event text, counted boolean)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_week text := to_char((now() at time zone 'Australia/Sydney')::date, 'IYYY-IW');
  v_xp int := greatest(p_correct, 0) * 10;
  v_score int := greatest(p_correct, 0) * 100;
  v_total bigint; v_cur int := 0; v_event text := 'already';
  v_inserted int;
begin
  if v_uid is null then raise exception 'Sign in to save your progress'; end if;

  insert into public.daily_quiz_results(user_id, subject, year, day, week_key, correct, total, score)
  values (v_uid, p_subject, p_year, v_today, v_week, greatest(p_correct,0), p_total, v_score)
  on conflict (user_id, subject, year, day) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select s.current into v_cur from public.streaks s where s.user_id = v_uid;
    return query select 0, coalesce((select us.total_xp from public.user_stats us where us.user_id=v_uid),0),
                        coalesce(v_cur,0), 'already', false;
    return;
  end if;

  -- first time today for this subject → reward
  insert into public.xp_events(user_id, reason_key, amount, kind, subject)
  values (v_uid, 'daily_quiz:' || gen_random_uuid(), v_xp, 'xp',
          case when p_subject in ('biology','chemistry','physics','maths','science','maths-standard','maths-advanced','maths-ext1')
               then p_subject else null end);
  insert into public.user_stats(user_id, total_xp) values (v_uid, v_xp)
  on conflict (user_id) do update set total_xp = public.user_stats.total_xp + v_xp, updated_at = now()
  returning user_stats.total_xp into v_total;

  select a.o_streak, a.o_event into v_cur, v_event from public._advance_streak(v_uid) a;

  perform public.apply_boss_damage(v_uid, p_subject, greatest(p_correct, 0));
  return query select v_xp, v_total, v_cur, v_event, true;
end $$;

create or replace function public.record_quick_game(p_subject text, p_year smallint, p_correct integer, p_total integer)
returns table(xp_awarded integer, total_xp bigint, streak integer, streak_event text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_xp int := greatest(p_correct, 0) * 10;
  v_total bigint; v_cur int; v_event text;
begin
  if v_uid is null then raise exception 'Sign in to save your progress'; end if;

  insert into public.xp_events(user_id, reason_key, amount, kind, subject)
  values (v_uid, 'quick_game:' || gen_random_uuid(), v_xp, 'xp',
          case when p_subject in
            ('biology','chemistry','physics','maths','science','maths-standard','maths-advanced','maths-ext1')
            then p_subject else null end);

  insert into public.user_stats(user_id, total_xp) values (v_uid, v_xp)
  on conflict (user_id) do update
    set total_xp = public.user_stats.total_xp + v_xp, updated_at = now()
  returning user_stats.total_xp into v_total;

  select a.o_streak, a.o_event into v_cur, v_event from public._advance_streak(v_uid) a;

  perform public.apply_boss_damage(v_uid, p_subject, greatest(p_correct, 0));
  return query select v_xp, v_total, v_cur, v_event;
end $$;

-- ---------------------------------------------------------------------------
-- Streak screen read model.
--   weekly_freeze_ready — the free auto-freeze hasn't been used this ISO week
--   missed_days         — weekdays missed since last play (before today)
--   will_reset          — playing today would reset (not enough freezes)
--   repair_*            — today's repair window, if one is open
-- ---------------------------------------------------------------------------
create or replace function public.get_streak_overview()
returns table(current int, freezes int, weekly_freeze_ready boolean, last_date date,
              active_days date[], frozen_days date[], missed_days int, will_reset boolean,
              repair_open boolean, broken_streak int, repair_progress int, repair_target int,
              next_repair_on date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_today  date := (now() at time zone 'Australia/Sydney')::date;
  v_week   text := to_char((now() at time zone 'Australia/Sydney')::date, 'IYYY-IW');
  s        public.streaks%rowtype;
  v_missed int := 0;
  v_ready  boolean;
  v_open   boolean;
  v_prog   int := 0;
  v_next   date;
begin
  if v_uid is null then return; end if;
  select * into s from public.streaks where user_id = v_uid;

  v_ready := s.last_freeze_week is distinct from v_week;

  if s.last_date is not null and s.last_date < v_today then
    select count(*) into v_missed
    from generate_series(s.last_date + 1, v_today - 1, interval '1 day') d
    where extract(isodow from d) <= 5;
  end if;

  v_next := case when s.last_repair_on is not null and s.last_repair_on + 14 > v_today
                 then s.last_repair_on + 14 end;
  v_open := s.broken_streak is not null and s.broken_on = v_today and v_next is null;

  if v_open then
    select count(*) into v_prog from public.question_attempts qa
    where qa.user_id = v_uid
      and qa.created_at >= (v_today::timestamp at time zone 'Australia/Sydney');
  end if;

  return query select
    coalesce(s.current, 0)::int,
    coalesce(s.freezes, 0)::int,
    v_ready,
    s.last_date,
    coalesce(s.active_days, '{}'),
    coalesce(s.frozen_days, '{}'),
    v_missed,
    (v_missed > 0 and v_missed > (case when v_ready then 1 else 0 end) + coalesce(s.freezes, 0)),
    coalesce(v_open, false),
    case when v_open then s.broken_streak::int end,
    v_prog,
    20,
    v_next;
end $$;

-- Win a broken streak back: same Sydney day as the break, 20 questions answered
-- today, and no repair in the last 14 days. Returns the restored streak.
create or replace function public.repair_streak()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  s       public.streaks%rowtype;
  v_prog  int;
  v_new   int;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select * into s from public.streaks where user_id = v_uid for update;
  if not found or s.broken_streak is null or s.broken_on is distinct from v_today then
    raise exception 'repair_closed';
  end if;
  if s.last_repair_on is not null and s.last_repair_on + 14 > v_today then
    raise exception 'repair_cooldown';
  end if;

  select count(*) into v_prog from public.question_attempts qa
  where qa.user_id = v_uid
    and qa.created_at >= (v_today::timestamp at time zone 'Australia/Sydney');
  if v_prog < 20 then raise exception 'repair_not_ready'; end if;

  v_new := s.broken_streak + coalesce(s.current, 1);
  update public.streaks set
    current = v_new, broken_streak = null, broken_on = null,
    last_repair_on = v_today, updated_at = now()
  where user_id = v_uid;
  return v_new;
end $$;

revoke all on function public.get_streak_overview() from public, anon;
revoke all on function public.repair_streak() from public, anon;
grant execute on function public.get_streak_overview(), public.repair_streak() to authenticated;
