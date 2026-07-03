-- Clash-of-Clans-style persistent base ("Research HQ"): idle Spark generation +
-- upgrade timers. Self-contained Sparks sink+faucet (uses spend_coins/credit_coins).
create table if not exists public.user_base (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reactor_lvl int not null default 1,
  vault_lvl int not null default 1,
  lab_lvl int not null default 1,
  collected_at timestamptz not null default now(),
  reactor_finishes_at timestamptz,
  vault_finishes_at timestamptz,
  lab_finishes_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.user_base enable row level security; -- no policies: SECURITY DEFINER fns only

-- Returns base state; auto-completes any finished upgrades. Costs/durations are
-- server-computed so the client never drifts from what gets charged.
create or replace function public.get_base()
returns table(reactor_lvl int, vault_lvl int, lab_lvl int,
  reactor_finishes_at timestamptz, vault_finishes_at timestamptz, lab_finishes_at timestamptz,
  pending int, cap int, rate int,
  reactor_cost int, vault_cost int, lab_cost int,
  reactor_secs int, vault_secs int, lab_secs int)
language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); b public.user_base; sp numeric;
begin
  if uid is null then raise exception 'auth required'; end if;
  insert into public.user_base(user_id) values (uid) on conflict (user_id) do nothing;
  select * into b from public.user_base where user_id = uid for update;
  if b.reactor_finishes_at is not null and b.reactor_finishes_at <= now() then b.reactor_lvl := b.reactor_lvl + 1; b.reactor_finishes_at := null; end if;
  if b.vault_finishes_at  is not null and b.vault_finishes_at  <= now() then b.vault_lvl  := b.vault_lvl  + 1; b.vault_finishes_at  := null; end if;
  if b.lab_finishes_at    is not null and b.lab_finishes_at    <= now() then b.lab_lvl    := b.lab_lvl    + 1; b.lab_finishes_at    := null; end if;
  update public.user_base set reactor_lvl=b.reactor_lvl, vault_lvl=b.vault_lvl, lab_lvl=b.lab_lvl,
    reactor_finishes_at=b.reactor_finishes_at, vault_finishes_at=b.vault_finishes_at, lab_finishes_at=b.lab_finishes_at, updated_at=now()
    where user_id=uid;
  sp := greatest(0.5, 1 - 0.05*(b.lab_lvl-1));
  return query select b.reactor_lvl, b.vault_lvl, b.lab_lvl,
    b.reactor_finishes_at, b.vault_finishes_at, b.lab_finishes_at,
    least(60*b.vault_lvl, floor(5.0*b.reactor_lvl * extract(epoch from (now()-b.collected_at))/3600))::int,
    60*b.vault_lvl, 5*b.reactor_lvl,
    round(40*power(1.6,b.reactor_lvl-1))::int, round(30*power(1.6,b.vault_lvl-1))::int, round(55*power(1.7,b.lab_lvl-1))::int,
    round(120*b.reactor_lvl*sp)::int, round(120*b.vault_lvl*sp)::int, round(180*b.lab_lvl*sp)::int;
end $$;
grant execute on function public.get_base() to authenticated;

create or replace function public.base_collect()
returns table(collected int, balance bigint)
language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); b public.user_base; v_pending int;
begin
  if uid is null then raise exception 'auth required'; end if;
  insert into public.user_base(user_id) values (uid) on conflict (user_id) do nothing;
  select * into b from public.user_base where user_id = uid for update;
  v_pending := least(60*b.vault_lvl, floor(5.0*b.reactor_lvl * extract(epoch from (now()-b.collected_at))/3600))::int;
  if v_pending <= 0 then return query select 0, coalesce((select coins from public.user_stats where user_id=uid),0); return; end if;
  update public.user_base set collected_at = now(), updated_at = now() where user_id = uid;
  return query select v_pending, public.credit_coins(v_pending, 'base_reactor', null);
end $$;
grant execute on function public.base_collect() to authenticated;

create or replace function public.base_upgrade(p_building text)
returns table(balance bigint, finishes_at timestamptz)
language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); b public.user_base; v_cost int; v_secs int; sp numeric; v_bal bigint; v_fin timestamptz;
begin
  if uid is null then raise exception 'auth required'; end if;
  insert into public.user_base(user_id) values (uid) on conflict (user_id) do nothing;
  select * into b from public.user_base where user_id = uid for update;
  sp := greatest(0.5, 1 - 0.05*(b.lab_lvl-1));
  if p_building = 'reactor' then
    if b.reactor_finishes_at is not null then raise exception 'already_upgrading'; end if;
    v_cost := round(40*power(1.6,b.reactor_lvl-1))::int; v_secs := round(120*b.reactor_lvl*sp)::int;
  elsif p_building = 'vault' then
    if b.vault_finishes_at is not null then raise exception 'already_upgrading'; end if;
    v_cost := round(30*power(1.6,b.vault_lvl-1))::int; v_secs := round(120*b.vault_lvl*sp)::int;
  elsif p_building = 'lab' then
    if b.lab_finishes_at is not null then raise exception 'already_upgrading'; end if;
    v_cost := round(55*power(1.7,b.lab_lvl-1))::int; v_secs := round(180*b.lab_lvl*sp)::int;
  else raise exception 'bad_building'; end if;
  v_bal := public.spend_coins(v_cost, 'base_upgrade', jsonb_build_object('building', p_building));
  v_fin := now() + (v_secs || ' seconds')::interval;
  if p_building = 'reactor' then update public.user_base set reactor_finishes_at=v_fin, updated_at=now() where user_id=uid;
  elsif p_building = 'vault' then update public.user_base set vault_finishes_at=v_fin, updated_at=now() where user_id=uid;
  else update public.user_base set lab_finishes_at=v_fin, updated_at=now() where user_id=uid; end if;
  return query select v_bal, v_fin;
end $$;
grant execute on function public.base_upgrade(text) to authenticated;