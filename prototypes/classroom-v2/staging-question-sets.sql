-- STAGING-ONLY. A host's saved question library. Upload a large set once
-- (up to 300 questions); each game draws a random selection from it.
-- Sets are private to the host who saved them. Full per-question validation
-- still happens in classroom_v2_create when a game is created.

create table classroom_v2_private.question_sets (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  name text not null check (length(name) between 1 and 80),
  subject text check (subject in ('biology','chemistry','physics','maths-standard','maths-advanced','maths-ext1')),
  questions jsonb not null check (jsonb_typeof(questions)='array' and jsonb_array_length(questions) between 1 and 300),
  created_at timestamptz not null default clock_timestamp()
);
create index question_sets_owner on classroom_v2_private.question_sets(owner, created_at desc);
alter table classroom_v2_private.question_sets enable row level security;
revoke all on classroom_v2_private.question_sets from public, anon, authenticated;

create function classroom_v2_private.require_host() returns uuid language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from classroom_v2_private.hosts h where h.actor=auth.uid() and h.enabled) then
    raise exception using errcode='42501', message='FORBIDDEN';
  end if;
  return auth.uid();
end $$;
revoke all on function classroom_v2_private.require_host() from public, anon, authenticated;

create function public.classroom_v2_set_save(p_name text, p_questions jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := classroom_v2_private.require_host(); v_id uuid; item jsonb; v_subject text;
begin
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception using errcode='22023', message='INVALID_SETUP'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) not between 1 and 300 or pg_column_size(p_questions) > 1500000 then
    raise exception using errcode='22023', message='INVALID_CONTENT';
  end if;
  for item in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'stem') is distinct from 'string' or jsonb_typeof(item->'options') is distinct from 'array'
       or jsonb_typeof(item->'correct_index') is distinct from 'number' or jsonb_typeof(item->'content_revision') is distinct from 'string' then
      raise exception using errcode='22023', message='INVALID_CONTENT';
    end if;
  end loop;
  if (select count(*) from classroom_v2_private.question_sets s where s.owner=v_owner) >= 100 then raise exception using errcode='22023', message='INVALID_SETUP'; end if;
  v_subject := p_questions->0->'teacher_draft'->>'subject';
  if v_subject not in ('biology','chemistry','physics','maths-standard','maths-advanced','maths-ext1') then v_subject := null; end if;
  insert into classroom_v2_private.question_sets(owner, name, subject, questions) values (v_owner, btrim(p_name), v_subject, p_questions) returning id into v_id;
  return v_id;
end $$;

create function public.classroom_v2_set_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := classroom_v2_private.require_host();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'subject', s.subject, 'count', jsonb_array_length(s.questions), 'created_at', s.created_at) order by s.created_at desc)
    from classroom_v2_private.question_sets s where s.owner=v_owner), '[]'::jsonb);
end $$;

create function public.classroom_v2_set_get(p_set uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := classroom_v2_private.require_host(); v jsonb;
begin
  select s.questions into v from classroom_v2_private.question_sets s where s.id=p_set and s.owner=v_owner;
  if v is null then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  return v;
end $$;

create function public.classroom_v2_set_delete(p_set uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := classroom_v2_private.require_host();
begin
  delete from classroom_v2_private.question_sets s where s.id=p_set and s.owner=v_owner;
  return found;
end $$;

revoke all on function public.classroom_v2_set_save(text,jsonb), public.classroom_v2_set_list(), public.classroom_v2_set_get(uuid), public.classroom_v2_set_delete(uuid) from public, anon, authenticated;
grant execute on function public.classroom_v2_set_save(text,jsonb), public.classroom_v2_set_list(), public.classroom_v2_set_get(uuid), public.classroom_v2_set_delete(uuid) to authenticated;
