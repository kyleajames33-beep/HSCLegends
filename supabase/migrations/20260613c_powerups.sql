-- Power-ups — a strategic Sparks sink that makes the quiz loop more fun.
-- Earn-only economy: bought with Sparks (coins), consumed during play. Prices are
-- server-authoritative (read from powerup_catalog). Writes via SECURITY DEFINER.

create table if not exists public.powerup_catalog (
  id          text primary key,
  name        text not null,
  emoji       text not null,
  description text not null,
  price       int  not null,
  sort        int  not null default 0
);

create table if not exists public.user_powerups (
  user_id    uuid not null references auth.users(id) on delete cascade,
  powerup_id text not null references public.powerup_catalog(id),
  count      int  not null default 0,
  primary key (user_id, powerup_id)
);
create index if not exists user_powerups_user_idx on public.user_powerups (user_id);

alter table public.powerup_catalog enable row level security;
alter table public.user_powerups   enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='powerup_catalog' and policyname='powerup_catalog_read')
    then create policy powerup_catalog_read on public.powerup_catalog for select to anon, authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='user_powerups' and policyname='user_powerups_own')
    then create policy user_powerups_own on public.user_powerups for select to authenticated using (user_id = auth.uid()); end if;
end $$;

insert into public.powerup_catalog (id, name, emoji, description, price, sort) values
  ('fifty_fifty',   '50-50',         '✂️', 'Removes two wrong answers.',               80, 1),
  ('hint',          'Hint',          '💡', 'Reveals a nudge before you answer.',       50, 2),
  ('double_sparks', 'Double Sparks', '✨', 'Earn 2× Sparks on the next question.',     60, 3),
  ('skip',          'Skip',          '⏭️', 'Skip a question with no penalty.',         40, 4),
  ('time_freeze',   'Time Freeze',   '⏱️', 'Pause the timer in timed modes.',         100, 5)
on conflict (id) do update set
  name=excluded.name, emoji=excluded.emoji, description=excluded.description,
  price=excluded.price, sort=excluded.sort;

-- buy: server-authoritative price; spends Sparks; bumps owned count.
create or replace function public.buy_powerup(p_powerup text, p_qty int default 1)
returns int language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_price int; v_count int;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if coalesce(p_qty,0) <= 0 then raise exception 'bad qty'; end if;
  select price into v_price from public.powerup_catalog where id = p_powerup;
  if not found then raise exception 'unknown_powerup'; end if;
  perform public.spend_coins(v_price * p_qty, 'buy_powerup', jsonb_build_object('powerup', p_powerup, 'qty', p_qty));
  insert into public.user_powerups(user_id, powerup_id, count) values (v_uid, p_powerup, p_qty)
  on conflict (user_id, powerup_id) do update set count = public.user_powerups.count + p_qty
  returning count into v_count;
  return v_count;
end $$;

-- get catalog with the caller's owned counts.
create or replace function public.get_powerups()
returns table(id text, name text, emoji text, description text, price int, count int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.emoji, c.description, c.price, coalesce(up.count, 0)
  from public.powerup_catalog c
  left join public.user_powerups up on up.powerup_id = c.id and up.user_id = auth.uid()
  order by c.sort;
$$;

-- consume one; returns remaining. Raises if none owned.
create or replace function public.use_powerup(p_powerup text)
returns int language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_count int;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  update public.user_powerups set count = count - 1
    where user_id = v_uid and powerup_id = p_powerup and count > 0
    returning count into v_count;
  if v_count is null then raise exception 'none_owned'; end if;
  return v_count;
end $$;

grant execute on function public.buy_powerup(text, int), public.get_powerups(),
  public.use_powerup(text) to anon, authenticated;
