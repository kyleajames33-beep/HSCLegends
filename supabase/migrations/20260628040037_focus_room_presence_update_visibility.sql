-- Let students refresh their own stale heartbeat row.
--
-- Postgres UPDATE checks SELECT visibility under RLS. The public room view
-- should only show recent rows from other students, but each student still
-- needs to see their own row so an upsert can update it after a tab sleeps or
-- a device reconnects.

drop policy if exists "focus_room_presence_select_recent"
  on public.focus_room_presence;

create policy "focus_room_presence_select_recent"
  on public.focus_room_presence for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      last_seen_at > now() - interval '2 minutes'
      and exists (
        select 1
        from public.focus_rooms fr
        where fr.id = focus_room_presence.room_id
          and fr.is_active = true
      )
    )
  );