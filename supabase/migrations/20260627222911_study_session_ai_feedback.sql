-- Study Squads AI marking feedback.
-- Feedback is generated server-side; no model/API keys are exposed to the browser.

create table if not exists public.study_session_ai_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  answer_id uuid not null references public.study_session_answers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  model text,
  mark_estimate smallint check (mark_estimate is null or mark_estimate between 0 and 5),
  confidence text check (confidence is null or confidence in ('low', 'medium', 'high')),
  strengths text[] not null default '{}',
  missing_criteria text[] not null default '{}',
  improvement text,
  exemplar text,
  safety_note text,
  raw_feedback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (answer_id, requested_by)
);

create index if not exists study_session_ai_feedback_user_idx
  on public.study_session_ai_feedback (user_id, created_at desc);

create index if not exists study_session_ai_feedback_session_idx
  on public.study_session_ai_feedback (session_id, created_at desc);

alter table public.study_session_ai_feedback enable row level security;

revoke all on public.study_session_ai_feedback from anon, authenticated;
grant select on public.study_session_ai_feedback to authenticated;

create policy "study_session_ai_feedback_select_own_or_owner"
  on public.study_session_ai_feedback for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or requested_by = (select auth.uid())
    or exists (
      select 1
      from public.study_sessions sess
      join public.study_squad_members m on m.squad_id = sess.squad_id
      where sess.id = study_session_ai_feedback.session_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
        and m.status = 'active'
    )
  );