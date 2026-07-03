-- Student block/mute controls for Study Squads.
-- This is scoped to squad interaction surfaces; it is not chat or direct messaging.

create table if not exists public.study_squad_member_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_user_id uuid not null references auth.users (id) on delete cascade,
  squad_id uuid not null references public.study_squads (id) on delete cascade,
  session_id uuid references public.study_sessions (id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 240),
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_user_id, squad_id),
  check (blocker_id <> blocked_user_id)
);

create index if not exists study_squad_member_blocks_blocker_idx
  on public.study_squad_member_blocks (blocker_id, squad_id, created_at desc);

create index if not exists study_squad_member_blocks_blocked_idx
  on public.study_squad_member_blocks (blocked_user_id, squad_id);

alter table public.study_squad_member_blocks enable row level security;

revoke all on public.study_squad_member_blocks from anon, authenticated;
grant select, insert, delete on public.study_squad_member_blocks to authenticated;

create policy "study_squad_member_blocks_select_own"
  on public.study_squad_member_blocks for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy "study_squad_member_blocks_insert_own_member"
  on public.study_squad_member_blocks for insert
  to authenticated
  with check (
    blocker_id = (select auth.uid())
    and blocker_id <> blocked_user_id
    and exists (
      select 1
      from public.study_squad_members m
      where m.squad_id = study_squad_member_blocks.squad_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
    and exists (
      select 1
      from public.study_squad_members m
      where m.squad_id = study_squad_member_blocks.squad_id
        and m.user_id = study_squad_member_blocks.blocked_user_id
        and m.status = 'active'
    )
    and (
      session_id is null
      or exists (
        select 1
        from public.study_sessions sess
        where sess.id = study_squad_member_blocks.session_id
          and sess.squad_id = study_squad_member_blocks.squad_id
      )
    )
  );

create policy "study_squad_member_blocks_delete_own"
  on public.study_squad_member_blocks for delete
  to authenticated
  using (blocker_id = (select auth.uid()));