-- Add the explicit Study Squads repair phase.
-- Repair sits after reveal: answers/reviews remain visible while students rewrite one weak response.

alter table public.study_sessions
  drop constraint if exists study_sessions_phase_check;

alter table public.study_sessions
  add constraint study_sessions_phase_check
  check (phase in ('scheduled', 'check_in', 'attempt', 'reveal', 'repair', 'complete', 'cancelled'));

drop policy if exists "study_session_answers_select_phase_or_own"
  on public.study_session_answers;

create policy "study_session_answers_select_phase_or_own"
  on public.study_session_answers for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.study_sessions sess
      join public.study_squad_members m on m.squad_id = sess.squad_id
      where sess.id = session_id
        and sess.phase in ('reveal', 'repair', 'complete')
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

drop policy if exists "study_session_peer_reviews_insert_own_reveal_member"
  on public.study_session_peer_reviews;

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
        and sess.phase in ('reveal', 'repair', 'complete')
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

drop policy if exists "study_session_peer_reviews_update_own_reveal_member"
  on public.study_session_peer_reviews;

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
        and sess.phase in ('reveal', 'repair', 'complete')
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );