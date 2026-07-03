-- Qualify peer-review session checks so RLS compares against the review row.

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
      where a.id = study_session_peer_reviews.answer_id
        and a.session_id = study_session_peer_reviews.session_id
        and a.user_id = study_session_peer_reviews.reviewed_user_id
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
      where a.id = study_session_peer_reviews.answer_id
        and a.session_id = study_session_peer_reviews.session_id
        and a.user_id = study_session_peer_reviews.reviewed_user_id
        and sess.phase in ('reveal', 'repair', 'complete')
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );