-- Qualify safety-report context checks so RLS compares against the report row.

drop policy if exists "study_squad_safety_reports_insert_own_member_context"
  on public.study_squad_safety_reports;

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
        where m.squad_id = study_squad_safety_reports.squad_id
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
        where sess.id = study_squad_safety_reports.session_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
      )
    )
  );