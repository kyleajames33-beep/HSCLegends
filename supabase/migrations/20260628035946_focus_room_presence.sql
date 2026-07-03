-- Focus Rooms presence heartbeat.
--
-- This gives the open study rooms a durable, privacy-minimal presence source
-- for room counts and avatar tiles without adding chat, DMs, video, or public
-- profiles.

create table if not exists public.focus_room_presence (
  room_id        text not null references public.focus_rooms (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 1 and 40),
  char_id        text not null default 'leaf' check (char_length(char_id) between 1 and 24),
  goal_text      text check (goal_text is null or char_length(goal_text) <= 180),
  status         text not null default 'focused'
                 check (status in ('focused', 'goal done', 'away')),
  joined_at      timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists focus_room_presence_room_seen_idx
  on public.focus_room_presence (room_id, last_seen_at desc);

alter table public.focus_room_presence enable row level security;

revoke all on public.focus_room_presence from anon, authenticated;
grant select, insert, update, delete on public.focus_room_presence to authenticated;

create policy "focus_room_presence_select_recent"
  on public.focus_room_presence for select
  to authenticated
  using (
    last_seen_at > now() - interval '2 minutes'
    and exists (
      select 1
      from public.focus_rooms fr
      where fr.id = focus_room_presence.room_id
        and fr.is_active = true
    )
  );

create policy "focus_room_presence_insert_own"
  on public.focus_room_presence for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "focus_room_presence_update_own"
  on public.focus_room_presence for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "focus_room_presence_delete_own"
  on public.focus_room_presence for delete
  to authenticated
  using ((select auth.uid()) = user_id);