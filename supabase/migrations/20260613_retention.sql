-- Retention layer — Daily Spin + login ladder, Streak Freeze, and Quests.
-- All rewards are EARN-ONLY (no paid spins). The spin is free, once per day.
-- Streak Freeze is mercy (cap 5). Copy stays encouraging, never guilt.
-- Daily/weekly resets use Australia/Sydney time. Tables are read-only via RLS;
-- all writes go through SECURITY DEFINER functions.

-- ---------------------------------------------------------------------------
-- Streak Freeze stock lives on the existing streaks table.
-- ---------------------------------------------------------------------------
alter table public.streaks add column if not exists freezes smallint default 0;

-- ---------------------------------------------------------------------------
-- Daily Spin + login ladder state (one row per user).
-- ---------------------------------------------------------------------------
create table if not exists public.daily_spins (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  last_spin_date date,
  ladder_day     int default 0,
  updated_at     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Quest catalog + per-user, per-period progress.
-- ---------------------------------------------------------------------------
create table if not exists public.quests (
  id           text primary key,
  scope        text not null check (scope in ('daily','weekly')),
  title        text not null,
  metric       text not null,
  target       int  not null,
  reward_coins int  not null,
  sort         int  default 0,
  active       bool default true
);

create table if not exists public.user_quests (
  user_id    uuid not null references auth.users(id) on delete cascade,
  quest_id   text not null references public.quests(id),
  period_key text not null,
  progress   int  default 0,
  claimed    bool default false,
  updated_at timestamptz default now(),
  primary key (user_id, quest_id, period_key)
);
create index if not exists user_quests_user_idx on public.user_quests (user_id);

-- ---------------------------------------------------------------------------
-- RLS: quests public read; daily_spins/user_quests readable for own rows only.
-- No insert/update/delete policies → writes happen only via SECURITY DEFINER.
-- ---------------------------------------------------------------------------
alter table public.daily_spins enable row level security;
alter table public.quests      enable row level security;
alter table public.user_quests enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='quests' and policyname='quests_read')
    then create policy quests_read on public.quests for select to anon, authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='daily_spins' and policyname='daily_spins_own')
    then create policy daily_spins_own on public.daily_spins for select to authenticated using (user_id = auth.uid()); end if;
  if not exists (select 1 from pg_policies where tablename='user_quests' and policyname='user_quests_own')
    then create policy user_quests_own on public.user_quests for select to authenticated using (user_id = auth.uid()); end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed quests. Upsert so re-running is safe.
-- ---------------------------------------------------------------------------
insert into public.quests (id, scope, title, metric, target, reward_coins, sort) values
  ('answer_10',       'daily',  'Answer 10 questions',   'answer',     10, 30,  1),
  ('correct_5',       'daily',  'Get 5 correct',         'correct',     5, 25,  2),
  ('streak_keep',     'daily',  'Keep your streak',      'daily_quiz',  1, 20,  3),
  ('play_arena',      'daily',  'Play an Arena game',    'arena_game',  1, 40,  4),
  ('daily_quiz_done', 'daily',  'Finish a daily quiz',   'daily_quiz',  1, 25,  5),
  ('answer_100',      'weekly', 'Answer 100 this week',  'answer',    100, 200, 1),
  ('win_3_duels',     'weekly', 'Win 3 Duels',           'duel_win',    3, 250, 2)
on conflict (id) do update set
  scope=excluded.scope, title=excluded.title, metric=excluded.metric,
  target=excluded.target, reward_coins=excluded.reward_coins, sort=excluded.sort,
  active=true;

-- ---------------------------------------------------------------------------
-- Period-key helpers (Australia/Sydney).
--   daily  → 'YYYY-MM-DD'
--   weekly → ISO year + week, e.g. '2026-W24'
-- ---------------------------------------------------------------------------
create or replace function public._aest_today()
returns date language sql stable set search_path = public as $$
  select (timezone('Australia/Sydney', now()))::date;
$$;

create or replace function public._daily_key()
returns text language sql stable set search_path = public as $$
  select to_char(timezone('Australia/Sydney', now()), 'YYYY-MM-DD');
$$;

create or replace function public._weekly_key()
returns text language sql stable set search_path = public as $$
  select to_char(timezone('Australia/Sydney', now()), 'IYYY-"W"IW');
$$;

create or replace function public._quest_period_key(p_scope text)
returns text language sql stable set search_path = public as $$
  select case when p_scope = 'weekly' then public._weekly_key() else public._daily_key() end;
$$;

-- ---------------------------------------------------------------------------
-- Daily Spin
-- ---------------------------------------------------------------------------
create or replace function public.get_spin_status()
returns table(can_spin boolean, ladder_day int)
language sql stable security definer set search_path = public as $$
  select
    coalesce(ds.last_spin_date is null or ds.last_spin_date < public._aest_today(), true),
    coalesce(ds.ladder_day, 0)
  from (select auth.uid() as uid) me
  left join public.daily_spins ds on ds.user_id = me.uid;
$$;

-- Weighted random Sparks. Day 7 of the ladder is a guaranteed bonus (300).
create or replace function public.spin_daily()
returns table(reward int, ladder_day int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid     uuid := auth.uid();
  v_today   date := public._aest_today();
  v_last    date;
  v_prev    int;
  v_day     int;
  v_reward  int;
  v_roll    int;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  select last_spin_date, ladder_day into v_last, v_prev
    from public.daily_spins where user_id = v_uid;

  if v_last is not null and v_last >= v_today then
    raise exception 'already_spun';
  end if;

  -- Consecutive-day ladder: yesterday → advance (wrapping 7→1), else restart at 1.
  if v_last = v_today - 1 then
    v_day := (coalesce(v_prev, 0) % 7) + 1;
  else
    v_day := 1;
  end if;

  if v_day = 7 then
    -- Day-7 guaranteed bonus.
    v_reward := 300;
  else
    -- Weighted Sparks out of 100: small amounts are common, big amounts rare.
    v_roll := floor(random() * 100)::int;  -- 0..99
    v_reward := case
      when v_roll < 35 then 10   -- 35
      when v_roll < 60 then 20   -- 25
      when v_roll < 78 then 30   -- 18
      when v_roll < 90 then 50   -- 12
      when v_roll < 97 then 75   -- 7
      when v_roll < 99 then 100  -- 2
      else 150                   -- 1
    end;
  end if;

  perform public.credit_coins(v_reward, 'daily_spin',
    jsonb_build_object('ladder_day', v_day));

  insert into public.daily_spins (user_id, last_spin_date, ladder_day, updated_at)
    values (v_uid, v_today, v_day, now())
  on conflict (user_id) do update set
    last_spin_date = excluded.last_spin_date,
    ladder_day     = excluded.ladder_day,
    updated_at     = now();

  return query select v_reward, v_day;
end $$;

-- ---------------------------------------------------------------------------
-- Streak status + Streak Freeze (mercy; cap 5).
-- ---------------------------------------------------------------------------
create or replace function public.get_streak_status()
returns table(current int, freezes int, last_date date)
language sql stable security definer set search_path = public as $$
  select coalesce(s.current, 0)::int, coalesce(s.freezes, 0)::int, s.last_date
  from (select auth.uid() as uid) me
  left join public.streaks s on s.user_id = me.uid;
$$;

create or replace function public.buy_streak_freeze()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_freezes int;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  -- Refuse to sell past the cap before charging the user.
  select coalesce(freezes, 0) into v_freezes from public.streaks where user_id = v_uid;
  if coalesce(v_freezes, 0) >= 5 then raise exception 'freeze_cap'; end if;

  perform public.spend_coins(150, 'streak_freeze', '{}'::jsonb);

  insert into public.streaks (user_id, current, freezes)
    values (v_uid, 0, 1)
  on conflict (user_id) do update set
    freezes = least(public.streaks.freezes + 1, 5)
  returning freezes into v_freezes;

  return v_freezes;
end $$;

-- ---------------------------------------------------------------------------
-- Quests: read, increment (orchestrator), claim.
-- ---------------------------------------------------------------------------
create or replace function public.get_quests()
returns table(id text, scope text, title text, target int, reward_coins int,
              progress int, claimed boolean)
language sql stable security definer set search_path = public as $$
  select q.id, q.scope, q.title, q.target, q.reward_coins,
         coalesce(uq.progress, 0), coalesce(uq.claimed, false)
  from public.quests q
  left join public.user_quests uq
    on uq.quest_id = q.id
   and uq.user_id  = auth.uid()
   and uq.period_key = public._quest_period_key(q.scope)
  where q.active
  order by q.scope, q.sort, q.id;
$$;

-- Bump progress for every active quest matching p_metric (current period each).
-- Orchestrator calls this from the quiz/game flow.
create or replace function public.increment_quest(p_metric text, p_amount int default 1)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  q     record;
begin
  if v_uid is null then return; end if;
  if coalesce(p_amount, 0) <= 0 then return; end if;

  for q in
    select id, scope, target from public.quests
    where active and metric = p_metric
  loop
    insert into public.user_quests (user_id, quest_id, period_key, progress, updated_at)
      values (v_uid, q.id, public._quest_period_key(q.scope), least(p_amount, q.target), now())
    on conflict (user_id, quest_id, period_key) do update set
      progress   = least(public.user_quests.progress + p_amount, q.target),
      updated_at = now();
  end loop;
end $$;

-- Claim a completed, unclaimed quest for the current period → credit reward.
create or replace function public.claim_quest(p_quest_id text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_scope  text;
  v_target int;
  v_reward int;
  v_period text;
  v_prog   int;
  v_claim  boolean;
  v_coins  int;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  select scope, target, reward_coins into v_scope, v_target, v_reward
    from public.quests where id = p_quest_id and active;
  if not found then raise exception 'unknown_quest'; end if;

  v_period := public._quest_period_key(v_scope);

  select progress, claimed into v_prog, v_claim
    from public.user_quests
    where user_id = v_uid and quest_id = p_quest_id and period_key = v_period;

  if coalesce(v_claim, false) then raise exception 'already_claimed'; end if;
  if coalesce(v_prog, 0) < v_target then raise exception 'not_complete'; end if;

  insert into public.user_quests (user_id, quest_id, period_key, progress, claimed, updated_at)
    values (v_uid, p_quest_id, v_period, v_target, true, now())
  on conflict (user_id, quest_id, period_key) do update set
    claimed = true, updated_at = now();

  perform public.credit_coins(v_reward, 'quest:' || p_quest_id, '{}'::jsonb);

  select coins into v_coins from public.get_wallet();
  return v_coins;
end $$;

grant execute on function
  public._aest_today(),
  public._daily_key(),
  public._weekly_key(),
  public._quest_period_key(text),
  public.get_spin_status(),
  public.spin_daily(),
  public.get_streak_status(),
  public.buy_streak_freeze(),
  public.get_quests(),
  public.increment_quest(text, int),
  public.claim_quest(text)
  to anon, authenticated;
