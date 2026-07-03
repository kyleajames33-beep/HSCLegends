-- Study Squads attendance and completion records.
-- Records participation only: no chat, no social profile data, no school data.

create table if not exists public.study_session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'checked_in' check (status in ('checked_in', 'completed')),
  checked_in_at timestamptz,
  completed_at timestamptz,
  commitment_text text check (commitment_text is null or char_length(commitment_text) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists study_session_attendance_user_idx
  on public.study_session_attendance (user_id, updated_at desc);

create index if not exists study_session_attendance_session_idx
  on public.study_session_attendance (session_id, status);

alter table public.study_session_attendance enable row level security;

revoke all on public.study_session_attendance from anon, authenticated;
grant select, insert, update on public.study_session_attendance to authenticated;

create policy "study_session_attendance_select_own_or_owner"
  on public.study_session_attendance for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.study_sessions sess
      join public.study_squad_members m on m.squad_id = sess.squad_id
      where sess.id = session_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
        and m.status = 'active'
    )
  );

create policy "study_session_attendance_insert_own_member"
  on public.study_session_attendance for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.study_sessions sess
      join public.study_squad_members m on m.squad_id = sess.squad_id
      where sess.id = session_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

create policy "study_session_attendance_update_own_member"
  on public.study_session_attendance for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.study_sessions sess
      join public.study_squad_members m on m.squad_id = sess.squad_id
      where sess.id = session_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.study_sessions sess
      join public.study_squad_members m on m.squad_id = sess.squad_id
      where sess.id = session_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );