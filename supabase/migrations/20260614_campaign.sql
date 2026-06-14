-- Solo Boss Campaign — single-player progression mode.
-- One boss per subject; answer questions to chip its HP; defeat it to bank
-- Sparks, advance a stage, and face a tougher (more HP) version next time.

create table if not exists public.user_campaign (
  user_id        uuid not null references auth.users(id) on delete cascade,
  subject        text not null,
  stage          int  not null default 1,
  hp             int  not null default 100,
  max_hp         int  not null default 100,
  defeated_count int  not null default 0,
  updated_at     timestamptz default now(),
  primary key (user_id, subject)
);

alter table public.user_campaign enable row level security;

-- Read-own only. All writes go through SECURITY DEFINER functions below.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='user_campaign' and policyname='user_campaign_read_own')
    then create policy user_campaign_read_own on public.user_campaign
      for select to authenticated using (user_id = auth.uid()); end if;
end $$;

-- ---------------------------------------------------------------------------
-- get_campaign — ensure a row exists for each of the 6 subjects for the
-- caller, then return all 6. Null caller → empty.
-- ---------------------------------------------------------------------------
create or replace function public.get_campaign()
returns table(subject text, stage int, hp int, max_hp int, defeated_count int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  insert into public.user_campaign (user_id, subject)
  select v_uid, s
  from unnest(array[
    'biology','chemistry','physics',
    'maths-standard','maths-advanced','maths-ext1'
  ]) as s
  on conflict (user_id, subject) do nothing;

  return query
    select c.subject, c.stage, c.hp, c.max_hp, c.defeated_count
    from public.user_campaign c
    where c.user_id = v_uid
    order by array_position(array[
      'biology','chemistry','physics',
      'maths-standard','maths-advanced','maths-ext1'
    ], c.subject);
end $$;

-- ---------------------------------------------------------------------------
-- campaign_attack — apply one answer to the subject's boss.
-- Correct → damage = 8 + max(0, difficulty)*4. HP floored at 0; reaching 0
-- defeats the boss: bank Sparks (50 + stage*25), bump stage & defeated_count,
-- and respawn a tougher boss (max_hp = 100 * new_stage, full HP).
-- ---------------------------------------------------------------------------
create or replace function public.campaign_attack(
  p_subject    text,
  p_correct    boolean,
  p_difficulty int default 1
)
returns table(hp int, max_hp int, stage int, defeated boolean, reward int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid      uuid := auth.uid();
  v_dmg      int;
  v_new_hp   int;
  v_stage    int;
  v_max_hp   int;
  v_defeated boolean := false;
  v_reward   int := 0;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  -- Make sure the caller has a row for this subject.
  insert into public.user_campaign (user_id, subject)
  values (v_uid, p_subject)
  on conflict (user_id, subject) do nothing;

  select c.hp, c.stage, c.max_hp
    into v_new_hp, v_stage, v_max_hp
  from public.user_campaign c
  where c.user_id = v_uid and c.subject = p_subject
  for update;

  if not p_correct then
    return query select v_new_hp, v_max_hp, v_stage, false, 0;
    return;
  end if;

  v_dmg := 8 + greatest(0, coalesce(p_difficulty, 1)) * 4;
  v_new_hp := greatest(0, v_new_hp - v_dmg);

  if v_new_hp <= 0 then
    v_defeated := true;
    v_reward   := 50 + v_stage * 25;
    perform public.credit_coins(v_reward, 'campaign',
      jsonb_build_object('subject', p_subject));

    v_stage  := v_stage + 1;
    v_max_hp := 100 * v_stage;
    v_new_hp := v_max_hp;

    update public.user_campaign c
      set stage = v_stage,
          max_hp = v_max_hp,
          hp = v_new_hp,
          defeated_count = c.defeated_count + 1,
          updated_at = now()
    where c.user_id = v_uid and c.subject = p_subject;
  else
    update public.user_campaign c
      set hp = v_new_hp,
          updated_at = now()
    where c.user_id = v_uid and c.subject = p_subject;
  end if;

  return query select v_new_hp, v_max_hp, v_stage, v_defeated, v_reward;
end $$;

grant execute on function public.get_campaign() to anon, authenticated;
grant execute on function public.campaign_attack(text, boolean, int) to anon, authenticated;
