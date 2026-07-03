-- Friends / social — a lightweight follow graph on top of user_profiles.
-- A friendships row means "user_id follows friend_id". Reads are self-scoped;
-- all writes go through SECURITY DEFINER RPCs so the follow graph stays sane.

create table if not exists public.friendships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.friendships enable row level security;
do $$ begin
  -- You can only read the people YOU follow. Writes are definer-only (no policy).
  if not exists (select 1 from pg_policies where tablename='friendships' and policyname='friendships_read_own')
    then create policy friendships_read_own on public.friendships
      for select to authenticated using (user_id = auth.uid()); end if;
end $$;

-- The caller's own shareable handle (Codename#0007), or null if no codename yet.
create or replace function public.get_my_handle()
returns text language sql stable security definer set search_path = public as $$
  select case when p.codename is not null and p.handle_tag is not null
              then p.codename || '#' || lpad(p.handle_tag::text, 4, '0') end
  from public.user_profiles p
  where p.user_id = auth.uid();
$$;

-- Add a friend by handle "Name#tag". Raises no_such_handle / cannot_add_self.
create or replace function public.add_friend(p_handle text)
returns table(friend_id uuid, name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_tag  text;
  v_target uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  p_handle := trim(p_handle);
  v_name := split_part(p_handle, '#', 1);
  v_tag  := split_part(p_handle, '#', 2);
  if v_name = '' or v_tag = '' then raise exception 'no_such_handle'; end if;

  select p.user_id,
         coalesce(nullif(p.display_name,''),
                  p.codename || '#' || lpad(p.handle_tag::text,4,'0'),
                  nullif(p.name,''), 'Legend')
    into v_target, name
  from public.user_profiles p
  where p.codename = v_name and p.handle_tag = v_tag::smallint;

  if v_target is null then raise exception 'no_such_handle'; end if;
  if v_target = v_uid then raise exception 'cannot_add_self'; end if;

  insert into public.friendships(user_id, friend_id)
    values (v_uid, v_target) on conflict do nothing;

  friend_id := v_target;
  return next;
end $$;

-- Stop following someone.
create or replace function public.remove_friend(p_friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  delete from public.friendships f where f.user_id = v_uid and f.friend_id = p_friend;
end $$;

-- Everyone the caller follows, with their stats for the friends list.
create or replace function public.get_friends()
returns table(friend_id uuid, name text, avatar_style text, avatar_seed text,
              division smallint, streak int, week_xp bigint, level int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  return query
  select p.user_id,
         coalesce(nullif(p.display_name,''),
                  case when p.codename is not null and p.handle_tag is not null
                       then p.codename || '#' || lpad(p.handle_tag::text,4,'0') end,
                  nullif(p.name,''), 'Legend'),
         p.avatar_style, p.avatar_seed,
         coalesce(lm.division, 0::smallint),
         coalesce(st.current, 0)::int,
         coalesce((select sum(x.amount) from public.xp_events x
           where x.user_id = p.user_id and x.created_at >= public._week_start_aest(0)), 0)::bigint,
         (floor(sqrt(coalesce(us.total_xp,0) / 50.0)) + 1)::int
  from public.friendships f
  join public.user_profiles p on p.user_id = f.friend_id
  left join public.league_members lm on lm.user_id = p.user_id
  left join public.streaks st on st.user_id = p.user_id
  left join public.user_stats us on us.user_id = p.user_id
  where f.user_id = v_uid
  order by week_xp desc;
end $$;

-- Board of the caller + everyone they follow, ranked by this week's XP.
create or replace function public.get_friends_board()
returns table(rank int, name text, week_xp bigint, is_me boolean,
              avatar_style text, avatar_seed text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  return query
  with people as (
    select v_uid as uid
    union
    select f.friend_id from public.friendships f where f.user_id = v_uid
  ),
  scored as (
    select ppl.uid,
      coalesce((select sum(x.amount) from public.xp_events x
        where x.user_id = ppl.uid and x.created_at >= public._week_start_aest(0)), 0) as wx
    from people ppl
  )
  select (row_number() over (order by s.wx desc))::int,
         coalesce(nullif(p.display_name,''),
                  case when p.codename is not null and p.handle_tag is not null
                       then p.codename || '#' || lpad(p.handle_tag::text,4,'0') end,
                  nullif(p.name,''), 'Legend'),
         s.wx::bigint,
         (s.uid = v_uid),
         p.avatar_style, p.avatar_seed
  from scored s
  join public.user_profiles p on p.user_id = s.uid
  order by s.wx desc;
end $$;

grant execute on function
  public.get_my_handle(),
  public.add_friend(text),
  public.remove_friend(uuid),
  public.get_friends(),
  public.get_friends_board()
to anon, authenticated;
