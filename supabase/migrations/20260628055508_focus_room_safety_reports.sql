-- Focus Room safety reports.
-- One-way student/admin safety signal; not chat, comments, or public moderation.

create table if not exists public.focus_room_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  room_id text references public.focus_rooms (id) on delete set null,
  focus_session_id uuid references public.focus_room_sessions (id) on delete set null,
  category text not null check (category in ('safety', 'privacy', 'content', 'technical', 'other')),
  detail text not null check (char_length(detail) between 5 and 1000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'dismissed')),
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists focus_room_safety_reports_reporter_idx
  on public.focus_room_safety_reports (reporter_id, created_at desc);

create index if not exists focus_room_safety_reports_status_idx
  on public.focus_room_safety_reports (status, created_at desc);

create index if not exists focus_room_safety_reports_room_idx
  on public.focus_room_safety_reports (room_id, created_at desc);

create index if not exists focus_room_safety_reports_reviewed_by_idx
  on public.focus_room_safety_reports (reviewed_by, reviewed_at desc);

alter table public.focus_room_safety_reports enable row level security;

revoke all on public.focus_room_safety_reports from anon, authenticated;
grant select, insert, update on public.focus_room_safety_reports to authenticated;

create policy "focus_room_safety_reports_select_own"
  on public.focus_room_safety_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "focus_room_safety_reports_insert_own"
  on public.focus_room_safety_reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "focus_room_safety_reports_select_moderator"
  on public.focus_room_safety_reports for select
  to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'admin'), '') = 'true'
  );

create policy "focus_room_safety_reports_update_moderator"
  on public.focus_room_safety_reports for update
  to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'admin'), '') = 'true'
  )
  with check (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'admin'), '') = 'true'
  );