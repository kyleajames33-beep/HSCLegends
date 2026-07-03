-- Championships / live Events — a time-boxed challenge with a live leaderboard
-- and a claimable milestone reward. Individual-friendly (works without a class):
-- event points = correct answers during the window (optionally subject-filtered),
-- computed live from question_attempts. Hit the target → claim a one-off reward.

create table if not exists public.events (
  id           text primary key,
  name         text not null,
  subject      text,                    -- null = all subjects
  target       int  not null,           -- correct answers to unlock the reward
  reward_coins int  not null default 0,
  reward_card  text,                    -- optional card_id granted with the reward
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  active       boolean not null default true
);
create table if not exists public.event_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_id   text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.events       enable row level security;
alter table public.event_claims enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='events' and policyname='events_read')
    then create policy events_read on public.events for select to anon, authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='event_claims' and policyname='event_claims_own')
    then create policy event_claims_own on public.event_claims for select to authenticated using (user_id = auth.uid()); end if;
end $$;

-- Seed a current live event.
insert into public.events (id, name, subject, target, reward_coins, reward_card, starts_at, ends_at) values
  ('sprint-2026-07', 'Winter Sprint 🏆', null, 40, 250, 'leg-newton',
   '2026-07-01 00:00+10', '2026-07-21 23:59+10')
on conflict (id) do update set name=excluded.name, subject=excluded.subject, target=excluded.target,
  reward_coins=excluded.reward_coins, reward_card=excluded.reward_card,
  starts_at=excluded.starts_at, ends_at=excluded.ends_at, active=true;

-- My event snapshot: points (correct answers in window), rank, target, claim state.
create or replace function public.get_event()
returns table(id text, name text, subject text, ends_at timestamptz, target int,
              reward_coins int, reward_card text, my_points int, my_rank int,
              player_count int, claimed boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_id text; v_subj text; v_start timestamptz; v_end timestamptz;
begin
  select e.id, e.subject, e.starts_at, e.ends_at into v_id, v_subj, v_start, v_end
    from public.events e where e.active order by e.starts_at desc limit 1;
  if v_id is null then return; end if;
  return query
  with scores as (
    select qa.user_id, count(*)::int as pts
    from public.question_attempts qa
    where qa.correct and qa.created_at >= v_start and qa.created_at < v_end
      and (v_subj is null or qa.subject = v_subj)
    group by qa.user_id
  )
  select e.id, e.name, e.subject, e.ends_at, e.target, e.reward_coins, e.reward_card,
         coalesce((select pts from scores where user_id = v_uid), 0),
         coalesce((select count(*)::int + 1 from scores s2
                   where s2.pts > coalesce((select pts from scores where user_id = v_uid), 0)), 1),
         (select count(*)::int from scores),
         exists(select 1 from public.event_claims c where c.user_id = v_uid and c.event_id = e.id)
  from public.events e where e.id = v_id;
end $$;

-- Live leaderboard for the current event (opted-in players + me).
create or replace function public.get_event_board()
returns table(rank int, name text, points int, is_me boolean, avatar_style text, avatar_seed text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_subj text; v_start timestamptz; v_end timestamptz;
begin
  select e.subject, e.starts_at, e.ends_at into v_subj, v_start, v_end
    from public.events e where e.active order by e.starts_at desc limit 1;
  if v_start is null then return; end if;
  return query
  with scores as (
    select qa.user_id, count(*)::int as pts
    from public.question_attempts qa
    where qa.correct and qa.created_at >= v_start and qa.created_at < v_end
      and (v_subj is null or qa.subject = v_subj)
    group by qa.user_id
  )
  select (row_number() over (order by s.pts desc))::int,
         coalesce(nullif(p.display_name,''),
                  case when p.codename is not null and p.handle_tag is not null
                       then p.codename || '#' || lpad(p.handle_tag::text,4,'0') end,
                  nullif(p.name,''), 'Legend'),
         s.pts, (s.user_id = v_uid), p.avatar_style, p.avatar_seed
  from scores s
  join public.user_profiles p on p.user_id = s.user_id
  where p.leaderboard_opt_in = true or s.user_id = v_uid
  order by s.pts desc limit 50;
end $$;

-- Claim the milestone reward once points >= target.
create or replace function public.claim_event_reward()
returns text language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); v_id text; v_subj text; v_start timestamptz; v_end timestamptz;
  v_target int; v_coins int; v_card text; v_pts int; v_label text;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select e.id, e.subject, e.starts_at, e.ends_at, e.target, e.reward_coins, e.reward_card
    into v_id, v_subj, v_start, v_end, v_target, v_coins, v_card
    from public.events e where e.active order by e.starts_at desc limit 1;
  if v_id is null then raise exception 'no_event'; end if;
  if exists(select 1 from public.event_claims c where c.user_id = v_uid and c.event_id = v_id)
    then raise exception 'already_claimed'; end if;
  select count(*)::int into v_pts from public.question_attempts qa
    where qa.user_id = v_uid and qa.correct and qa.created_at >= v_start and qa.created_at < v_end
      and (v_subj is null or qa.subject = v_subj);
  if v_pts < v_target then raise exception 'locked'; end if;

  insert into public.event_claims(user_id, event_id) values (v_uid, v_id);
  v_label := v_coins || ' Sparks';
  if v_coins > 0 then perform public.credit_coins(v_coins, 'event:'||v_id, null); end if;
  if v_card is not null then
    insert into public.user_cards(user_id, card_id, count) values (v_uid, v_card, 1)
      on conflict (user_id, card_id) do update set count = public.user_cards.count + 1;
    v_label := v_label || ' + a card';
  end if;
  return v_label;
end $$;

grant execute on function public.get_event() to authenticated, anon;
grant execute on function public.get_event_board() to authenticated, anon;
grant execute on function public.claim_event_reward() to authenticated, anon;
