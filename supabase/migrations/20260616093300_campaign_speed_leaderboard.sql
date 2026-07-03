-- Campaign speed-clear leaderboard.
create table if not exists public.campaign_clears (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  stage int not null default 1,
  clear_ms int not null,
  created_at timestamptz not null default now()
);
create index if not exists campaign_clears_subject_ms_idx on public.campaign_clears (subject, clear_ms);
alter table public.campaign_clears enable row level security;
-- No policies: only the SECURITY DEFINER functions below may read/write.

create or replace function public.campaign_record_clear(p_subject text, p_stage int, p_clear_ms int)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if p_clear_ms is null or p_clear_ms <= 0 then return; end if;
  insert into public.campaign_clears(user_id, subject, stage, clear_ms)
    values (v_uid, p_subject, greatest(1, coalesce(p_stage, 1)), p_clear_ms);
end $$;
grant execute on function public.campaign_record_clear(text, int, int) to authenticated;

create or replace function public.campaign_leaderboard(p_subject text, p_limit int default 20)
returns table(rank bigint, name text, clear_ms int, stage int, is_me boolean, avatar_style text, avatar_seed text)
language sql stable security definer set search_path to 'public' as $$
  with ranked as (
    select c.user_id, c.clear_ms, c.stage,
           row_number() over (partition by c.user_id order by c.clear_ms asc, c.created_at asc) rn
    from public.campaign_clears c
    where c.subject = p_subject
  )
  select row_number() over (order by r.clear_ms asc),
         coalesce(nullif(p.display_name,''),
                  case when p.codename is not null and p.handle_tag is not null
                       then p.codename || '#' || lpad(p.handle_tag::text, 4, '0') end,
                  nullif(p.name,''), 'Player'),
         r.clear_ms, r.stage,
         r.user_id = auth.uid(),
         p.avatar_style, p.avatar_seed
  from ranked r
  join public.user_profiles p on p.user_id = r.user_id
  where r.rn = 1 and p.leaderboard_opt_in = true
  order by r.clear_ms asc
  limit p_limit;
$$;
grant execute on function public.campaign_leaderboard(text, int) to authenticated;