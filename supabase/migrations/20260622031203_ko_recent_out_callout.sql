-- Names eliminated in a given round (for the "💀 X knocked out!" callout).
-- Additive read-only; does not touch the existing ko_state/ko_advance flow.
create or replace function public.ko_recent_out(p_room uuid, p_round smallint)
returns table(alias text)
language sql stable security definer set search_path to 'public' as $$
  select p.alias from public.ko_players p
  where p.room_id = p_room and p.eliminated_round = p_round
  order by p.alias;
$$;
grant execute on function public.ko_recent_out(uuid, smallint) to anon, authenticated;