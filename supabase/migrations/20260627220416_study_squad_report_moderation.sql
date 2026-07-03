-- Admin/moderator review fields and RLS for Study Squad safety reports.
-- Admin status comes from auth.users app_metadata, not editable user metadata.

alter table public.study_squad_safety_reports
  add column if not exists moderator_note text
    check (moderator_note is null or char_length(moderator_note) <= 2000),
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists study_squad_safety_reports_reviewed_by_idx
  on public.study_squad_safety_reports (reviewed_by, reviewed_at desc);

grant update on public.study_squad_safety_reports to authenticated;

create policy "study_squad_safety_reports_select_moderator"
  on public.study_squad_safety_reports for select
  to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'admin'), '') = 'true'
  );

create policy "study_squad_safety_reports_update_moderator"
  on public.study_squad_safety_reports for update
  to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'admin'), '') = 'true'
  )
  with check (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'admin'), '') = 'true'
  );