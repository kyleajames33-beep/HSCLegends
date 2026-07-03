revoke all on public.focus_rooms from anon, authenticated;
revoke all on public.focus_room_sessions from anon, authenticated;

grant select on public.focus_rooms to anon, authenticated;
grant select, insert, update on public.focus_room_sessions to authenticated;
