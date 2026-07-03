-- Read-only squad/session context for report moderators.

create policy "study_squads_select_moderator"
  on public.study_squads for select
  to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'admin'), '') = 'true'
  );

create policy "study_sessions_select_moderator"
  on public.study_sessions for select
  to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'admin'), '') = 'true'
  );