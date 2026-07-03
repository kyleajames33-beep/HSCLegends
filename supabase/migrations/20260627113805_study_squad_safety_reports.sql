-- Study Squads safety reports.
-- One-way student/admin safety signal; not chat, comments, or public moderation.

create table if not exists public.study_squad_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  squad_id uuid references public.study_squads (id) on delete set null,
  session_id uuid references public.study_sessions (id) on delete set null,
  category text not null check (category in ('safety', 'privacy', 'content', 'technical', 'other')),
  detail text not null check (char_length(detail) between 5 and 1000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_squad_safety_reports_reporter_idx
  on public.study_squad_safety_reports (reporter_id, created_at desc);

create index if not exists study_squad_safety_reports_status_idx
  on public.study_squad_safety_reports (status, created_at desc);

alter table public.study_squad_safety_reports enable row level security;

revoke all on public.study_squad_safety_reports from anon, authenticated;
grant select, insert on public.study_squad_safety_reports to authenticated;

create policy "study_squad_safety_reports_select_own"
  on public.study_squad_safety_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "study_squad_safety_reports_insert_own_member_context"
  on public.study_squad_safety_reports for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (
      squad_id is null
      or exists (
        select 1
        from public.study_squad_members m
        where m.squad_id = squad_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
      )
    )
    and (
      session_id is null
      or exists (
        select 1
        from public.study_sessions sess
        join public.study_squad_members m on m.squad_id = sess.squad_id
        where sess.id = session_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
      )
    )
  );