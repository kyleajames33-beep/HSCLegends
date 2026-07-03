-- Focus Rooms MVP: public room catalogue + per-student focus logs.
-- Apply on a Supabase branch first. Do not apply to production without approval.

create table if not exists public.focus_rooms (
  id           text primary key,
  name         text not null,
  subject      text not null,
  year_group   smallint,
  module_label text,
  room_type    text not null default 'open'
                 check (room_type in ('open', 'quiet', 'subject')),
  is_active    boolean not null default true,
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now()
);

create table if not exists public.focus_room_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  room_id        text not null references public.focus_rooms (id) on delete restrict,
  goal_text      text not null check (char_length(goal_text) between 1 and 180),
  goal_completed boolean not null default false,
  focus_minutes  integer not null default 0 check (focus_minutes between 0 and 720),
  joined_at      timestamptz not null default now(),
  left_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists focus_room_sessions_user_created_idx
  on public.focus_room_sessions (user_id, created_at desc);

create index if not exists focus_room_sessions_room_created_idx
  on public.focus_room_sessions (room_id, created_at desc);

alter table public.focus_rooms enable row level security;
alter table public.focus_room_sessions enable row level security;

grant select on public.focus_rooms to anon, authenticated;
grant select, insert, update on public.focus_room_sessions to authenticated;

create policy "focus_rooms_read_active"
  on public.focus_rooms for select
  to anon, authenticated
  using (is_active = true);

create policy "focus_room_sessions_select_own"
  on public.focus_room_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "focus_room_sessions_insert_own"
  on public.focus_room_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "focus_room_sessions_update_own"
  on public.focus_room_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into public.focus_rooms (id, name, subject, year_group, module_label, room_type, sort_order)
values
  ('quiet-revision', 'Quiet revision', 'mixed', null, 'Open study', 'quiet', 10),
  ('bio-y12-mod7', 'Bio Mod 7 grind', 'biology', 12, 'Module 7', 'subject', 20),
  ('chem-y12-practice', 'Chem practice block', 'chemistry', 12, 'HSC practice', 'subject', 30),
  ('maths-standard', 'Maths Standard room', 'maths-standard', 12, 'Mixed topics', 'subject', 40)
on conflict (id) do update set
  name = excluded.name,
  subject = excluded.subject,
  year_group = excluded.year_group,
  module_label = excluded.module_label,
  room_type = excluded.room_type,
  sort_order = excluded.sort_order,
  is_active = true;
