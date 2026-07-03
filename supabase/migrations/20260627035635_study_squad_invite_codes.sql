-- Study Squads invite codes.
-- Invite rows are owner-visible only. Students join through a hardened RPC so
-- squads and invite codes are not publicly discoverable.

create table if not exists public.study_squad_invites (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.study_squads (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[a-z0-9-]{6,24}$'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  max_uses smallint not null default 6 check (max_uses between 1 and 6),
  uses_count smallint not null default 0 check (uses_count >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_squad_invites_squad_idx
  on public.study_squad_invites (squad_id, status);

alter table public.study_squad_invites enable row level security;

revoke all on public.study_squad_invites from anon, authenticated;
grant select, insert, update on public.study_squad_invites to authenticated;

create policy "study_squad_invites_select_owner"
  on public.study_squad_invites for select
  to authenticated
  using (
    exists (
      select 1 from public.study_squads s
      where s.id = squad_id
        and s.created_by = (select auth.uid())
    )
  );

create policy "study_squad_invites_insert_owner"
  on public.study_squad_invites for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.study_squads s
      where s.id = squad_id
        and s.created_by = (select auth.uid())
    )
  );

create policy "study_squad_invites_update_owner"
  on public.study_squad_invites for update
  to authenticated
  using (
    exists (
      select 1 from public.study_squads s
      where s.id = squad_id
        and s.created_by = (select auth.uid())
    )
  )
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.study_squads s
      where s.id = squad_id
        and s.created_by = (select auth.uid())
    )
  );

create or replace function public.join_study_squad_by_code(p_invite_code text)
returns table (
  squad_id uuid,
  squad_name text,
  member_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := lower(trim(coalesce(p_invite_code, '')));
  v_invite record;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if v_code !~ '^[a-z0-9-]{6,24}$' then
    raise exception 'Invite code is invalid or expired' using errcode = '22023';
  end if;

  select
    i.id,
    i.squad_id,
    i.uses_count,
    i.max_uses,
    s.name as squad_name,
    s.max_members
  into v_invite
  from public.study_squad_invites i
  join public.study_squads s on s.id = i.squad_id
  where i.invite_code = v_code
    and i.status = 'active'
    and (i.expires_at is null or i.expires_at > now())
    and s.status in ('forming', 'active')
  for update of i;

  if not found then
    raise exception 'Invite code is invalid or expired' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.study_squad_members m
    where m.squad_id = v_invite.squad_id
      and m.user_id = v_user_id
      and m.status = 'active'
  ) then
    return query select v_invite.squad_id, v_invite.squad_name, 'active'::text;
    return;
  end if;

  select count(*) into v_member_count
  from public.study_squad_members m
  where m.squad_id = v_invite.squad_id
    and m.status = 'active';

  if v_member_count >= v_invite.max_members then
    raise exception 'This squad is full' using errcode = '22023';
  end if;

  if v_invite.uses_count >= v_invite.max_uses then
    raise exception 'Invite code is invalid or expired' using errcode = '22023';
  end if;

  insert into public.study_squad_members (squad_id, user_id, role, status, joined_at)
  values (v_invite.squad_id, v_user_id, 'member', 'active', now())
  on conflict (squad_id, user_id)
  do update set
    role = case when public.study_squad_members.role = 'owner' then 'owner' else 'member' end,
    status = 'active',
    joined_at = coalesce(public.study_squad_members.joined_at, now());

  update public.study_squad_invites
  set uses_count = uses_count + 1,
      updated_at = now()
  where id = v_invite.id;

  return query select v_invite.squad_id, v_invite.squad_name, 'active'::text;
end;
$$;

revoke all on function public.join_study_squad_by_code(text) from public;
revoke all on function public.join_study_squad_by_code(text) from anon;
grant execute on function public.join_study_squad_by_code(text) to authenticated;