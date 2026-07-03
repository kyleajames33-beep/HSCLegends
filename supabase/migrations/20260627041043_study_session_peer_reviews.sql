-- Study Squads peer review.
-- Constrained rubric feedback only: no comment threads, reactions, DMs, or chat.

create table if not exists public.study_session_peer_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  answer_id uuid not null references public.study_session_answers (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id) on delete cascade,
  reviewed_user_id uuid not null references auth.users (id) on delete cascade,
  rubric_hits jsonb not null default '{}'::jsonb,
  improvement_text text check (improvement_text is null or char_length(improvement_text) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (answer_id, reviewer_id),
  check (reviewer_id <> reviewed_user_id)
);

create index if not exists study_session_peer_reviews_session_idx
  on public.study_session_peer_reviews (session_id, updated_at desc);

create index if not exists study_session_peer_reviews_reviewed_user_idx
  on public.study_session_peer_reviews (reviewed_user_id, updated_at desc);

alter table public.study_session_peer_reviews enable row level security;

revoke all on public.study_session_peer_reviews from anon, authenticated;
grant select, insert, update on public.study_session_peer_reviews to authenticated;

create policy "study_session_peer_reviews_select_relevant"
  on public.study_session_peer_reviews for select
  to authenticated
  using (
    reviewer_id = (select auth.uid())
    or reviewed_user_id = (select auth.uid())
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

create policy "study_session_peer_reviews_insert_own_reveal_member"
  on public.study_session_peer_reviews for insert
  to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and reviewer_id <> reviewed_user_id
    and exists (
      select 1
      from public.study_session_answers a
      join public.study_sessions sess on sess.id = a.session_id
      join public.study_squad_members m on m.squad_id = sess.squad_id
      where a.id = answer_id
        and a.session_id = session_id
        and a.user_id = reviewed_user_id
        and sess.phase in ('reveal', 'complete')
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

create policy "study_session_peer_reviews_update_own_reveal_member"
  on public.study_session_peer_reviews for update
  to authenticated
  using (reviewer_id = (select auth.uid()))
  with check (
    reviewer_id = (select auth.uid())
    and reviewer_id <> reviewed_user_id
    and exists (
      select 1
      from public.study_session_answers a
      join public.study_sessions sess on sess.id = a.session_id
      join public.study_squad_members m on m.squad_id = sess.squad_id
      where a.id = answer_id
        and a.session_id = session_id
        and a.user_id = reviewed_user_id
        and sess.phase in ('reveal', 'complete')
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );