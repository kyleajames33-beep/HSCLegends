create table if not exists public.study_squads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 60),
  subject text not null,
  year_group smallint check (year_group between 7 and 12),
  module_label text,
  visibility text not null default 'invite_only' check (visibility in ('invite_only')),
  status text not null default 'forming' check (status in ('forming', 'active', 'archived')),
  max_members smallint not null default 6 check (max_members between 2 and 6),
  recurring_days text[] not null default '{}',
  recurring_time_local time,
  timezone text not null default 'Australia/Sydney',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_squad_members (
  squad_id uuid not null references public.study_squads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('invited', 'active', 'left', 'removed')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.study_squads (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  scheduled_for timestamptz,
  phase text not null default 'scheduled' check (phase in ('scheduled', 'check_in', 'attempt', 'reveal', 'complete', 'cancelled')),
  question_pack_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_session_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  answer_text text not null check (char_length(answer_text) between 1 and 8000),
  visibility text not null default 'private_until_reveal' check (visibility in ('private_until_reveal')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists study_squads_created_by_idx on public.study_squads (created_by, created_at desc);
create index if not exists study_squad_members_user_idx on public.study_squad_members (user_id, status);
create index if not exists study_sessions_squad_time_idx on public.study_sessions (squad_id, scheduled_for desc);
create index if not exists study_session_answers_user_idx on public.study_session_answers (user_id, submitted_at desc);

alter table public.study_squads enable row level security;
alter table public.study_squad_members enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_session_answers enable row level security;

revoke all on public.study_squads from anon, authenticated;
revoke all on public.study_squad_members from anon, authenticated;
revoke all on public.study_sessions from anon, authenticated;
revoke all on public.study_session_answers from anon, authenticated;

grant select, insert, update on public.study_squads to authenticated;
grant select, insert, update on public.study_squad_members to authenticated;
grant select, insert, update on public.study_sessions to authenticated;
grant select, insert, update on public.study_session_answers to authenticated;

create policy "study_squads_select_member"
  on public.study_squads for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.study_squad_members m
      where m.squad_id = id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

create policy "study_squads_insert_own"
  on public.study_squads for insert
  to authenticated
  with check (created_by = (select auth.uid()) and visibility = 'invite_only');

create policy "study_squads_update_owner"
  on public.study_squads for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()) and visibility = 'invite_only');

create policy "study_squad_members_select_own"
  on public.study_squad_members for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "study_squad_members_insert_owned_squad"
  on public.study_squad_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.study_squads s
      where s.id = squad_id
        and s.created_by = (select auth.uid())
    )
  );

create policy "study_squad_members_update_owned_squad"
  on public.study_squad_members for update
  to authenticated
  using (
    exists (
      select 1 from public.study_squads s
      where s.id = squad_id
        and s.created_by = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.study_squads s
      where s.id = squad_id
        and s.created_by = (select auth.uid())
    )
  );

create policy "study_sessions_select_member"
  on public.study_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.study_squad_members m
      where m.squad_id = squad_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

create policy "study_sessions_insert_owner"
  on public.study_sessions for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.study_squad_members m
      where m.squad_id = squad_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
        and m.status = 'active'
    )
  );

create policy "study_sessions_update_owner"
  on public.study_sessions for update
  to authenticated
  using (
    exists (
      select 1 from public.study_squad_members m
      where m.squad_id = squad_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
        and m.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.study_squad_members m
      where m.squad_id = squad_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
        and m.status = 'active'
    )
  );

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
        and sess.phase in ('reveal', 'complete')
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

create policy "study_session_answers_insert_own_attempt"
  on public.study_session_answers for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.study_sessions sess
      join public.study_squad_members m on m.squad_id = sess.squad_id
      where sess.id = session_id
        and sess.phase = 'attempt'
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

create policy "study_session_answers_update_own_attempt"
  on public.study_session_answers for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.study_sessions sess
      where sess.id = session_id
        and sess.phase = 'attempt'
    )
  );
