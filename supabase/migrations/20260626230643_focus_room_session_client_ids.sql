alter table public.focus_room_sessions
  add column if not exists client_session_id text;

create unique index if not exists focus_room_sessions_user_client_id_idx
  on public.focus_room_sessions (user_id, client_session_id);
