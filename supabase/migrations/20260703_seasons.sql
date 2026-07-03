-- Seasons / Term Pass — a FREE XP-gated reward track over an HSC term.
-- Season XP = XP earned since the season started (from xp_events). Hitting a tier's
-- XP unlocks a claimable reward (Sparks / power-up / Legend card). Earn-only, no paid
-- track (keeps us clear of loot-box/monetisation-of-minors concerns).

create table if not exists public.seasons (
  id        text primary key,
  name      text not null,
  starts_on date not null,
  ends_on   date not null,
  active    boolean not null default true
);

create table if not exists public.season_tiers (
  season_id     text not null references public.seasons(id) on delete cascade,
  tier          int  not null,
  xp_required   int  not null,
  reward_kind   text not null check (reward_kind in ('coins','powerup','card')),
  reward_ref    text,            -- powerup_id | card_id (null for coins)
  reward_amount int  not null default 0,
  label         text not null,
  primary key (season_id, tier)
);

create table if not exists public.user_season_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  season_id  text not null,
  tier       int  not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, season_id, tier)
);

alter table public.seasons            enable row level security;
alter table public.season_tiers       enable row level security;
alter table public.user_season_claims enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='seasons' and policyname='seasons_read')
    then create policy seasons_read on public.seasons for select to anon, authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='season_tiers' and policyname='season_tiers_read')
    then create policy season_tiers_read on public.season_tiers for select to anon, authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='user_season_claims' and policyname='user_season_claims_own')
    then create policy user_season_claims_own on public.user_season_claims for select to authenticated using (user_id = auth.uid()); end if;
end $$;

-- Seed the current term + a 10-tier track.
insert into public.seasons (id, name, starts_on, ends_on) values
  ('2026-t3', 'Term 3 2026', '2026-07-01', '2026-09-20')
on conflict (id) do update set name=excluded.name, starts_on=excluded.starts_on, ends_on=excluded.ends_on, active=true;

insert into public.season_tiers (season_id, tier, xp_required, reward_kind, reward_ref, reward_amount, label) values
  ('2026-t3',  1,  100, 'coins',   null,           100, '100 Sparks'),
  ('2026-t3',  2,  250, 'powerup', 'hint',           2, '2× Hint'),
  ('2026-t3',  3,  500, 'coins',   null,           200, '200 Sparks'),
  ('2026-t3',  4,  800, 'powerup', 'fifty_fifty',    2, '2× 50-50'),
  ('2026-t3',  5, 1200, 'card',    'leg-darwin',     1, 'Darwin card'),
  ('2026-t3',  6, 1700, 'coins',   null,           300, '300 Sparks'),
  ('2026-t3',  7, 2300, 'powerup', 'double_sparks',  3, '3× Double Sparks'),
  ('2026-t3',  8, 3000, 'coins',   null,           400, '400 Sparks'),
  ('2026-t3',  9, 4000, 'powerup', 'skip',           3, '3× Skip'),
  ('2026-t3', 10, 5000, 'card',    'leg-legend',     1, 'The HSC Legend (Mythic)')
on conflict (season_id, tier) do update set
  xp_required=excluded.xp_required, reward_kind=excluded.reward_kind,
  reward_ref=excluded.reward_ref, reward_amount=excluded.reward_amount, label=excluded.label;

-- Current season snapshot: my season XP + every tier with unlocked/claimed state.
create or replace function public.get_season()
returns table(season_id text, name text, ends_on date, season_xp bigint,
              tier int, xp_required int, reward_kind text, reward_ref text,
              reward_amount int, label text, unlocked boolean, claimed boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_sid text; v_start date; v_xp bigint;
begin
  select id, starts_on into v_sid, v_start from public.seasons where active order by starts_on desc limit 1;
  if v_sid is null then return; end if;
  v_xp := coalesce((select sum(x.amount) from public.xp_events x
    where x.user_id = v_uid and x.created_at >= v_start), 0);
  return query
  select s.id, s.name, s.ends_on, v_xp,
         t.tier, t.xp_required, t.reward_kind, t.reward_ref, t.reward_amount, t.label,
         (v_xp >= t.xp_required),
         exists(select 1 from public.user_season_claims c
                where c.user_id = v_uid and c.season_id = s.id and c.tier = t.tier)
  from public.seasons s
  join public.season_tiers t on t.season_id = s.id
  where s.id = v_sid
  order by t.tier;
end $$;

-- Claim a tier: must be unlocked (enough season XP) and unclaimed. Grants the reward.
create or replace function public.claim_season_tier(p_tier int)
returns text language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); v_sid text; v_start date; v_xp bigint;
  v_kind text; v_ref text; v_amt int; v_req int; v_label text;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select id, starts_on into v_sid, v_start from public.seasons where active order by starts_on desc limit 1;
  if v_sid is null then raise exception 'no_season'; end if;
  select xp_required, reward_kind, reward_ref, reward_amount, label
    into v_req, v_kind, v_ref, v_amt, v_label
  from public.season_tiers where season_id = v_sid and tier = p_tier;
  if not found then raise exception 'no_such_tier'; end if;

  v_xp := coalesce((select sum(x.amount) from public.xp_events x
    where x.user_id = v_uid and x.created_at >= v_start), 0);
  if v_xp < v_req then raise exception 'locked'; end if;
  if exists(select 1 from public.user_season_claims c
            where c.user_id = v_uid and c.season_id = v_sid and c.tier = p_tier)
    then raise exception 'already_claimed'; end if;

  insert into public.user_season_claims(user_id, season_id, tier) values (v_uid, v_sid, p_tier);

  if v_kind = 'coins' then
    perform public.credit_coins(v_amt, 'season:'||p_tier, null);
  elsif v_kind = 'powerup' then
    insert into public.user_powerups(user_id, powerup_id, count) values (v_uid, v_ref, v_amt)
      on conflict (user_id, powerup_id) do update set count = public.user_powerups.count + v_amt;
  elsif v_kind = 'card' then
    insert into public.user_cards(user_id, card_id, count) values (v_uid, v_ref, 1)
      on conflict (user_id, card_id) do update set count = public.user_cards.count + 1;
  end if;

  return v_label;
end $$;

grant execute on function public.get_season() to authenticated, anon;
grant execute on function public.claim_season_tier(int) to authenticated, anon;
