-- STAGING-ONLY DESIGN CANDIDATE. NEVER APPLY TO PRODUCTION OR SHARED DATABASES.
-- auth.uid() must come from verified Supabase request identity; the standalone
-- local harness supplies a forgeable test double and synthetic data only.
-- New objects only: no changes to existing legacy functions, tables or grants.
begin;
create schema classroom_v2_private;
revoke all on schema classroom_v2_private from public, anon, authenticated;

-- Trusted provisioning only. Clients cannot grant themselves hosting rights.
create table classroom_v2_private.hosts (
  actor uuid primary key, enabled boolean not null default true
);
create table classroom_v2_private.rooms (
  id uuid primary key default gen_random_uuid(), join_code uuid not null unique default gen_random_uuid(),
  host_actor uuid not null, create_request_id uuid not null, create_payload jsonb not null,
  state text not null default 'lobby' check (state in ('lobby','active','complete')),
  active_index integer not null default -1 check (active_index >= -1),
  version bigint not null default 0 check (version >= 0),
  per_question_seconds smallint not null check (per_question_seconds between 5 and 120),
  expires_at timestamptz not null default (clock_timestamp() + interval '6 hours'),
  unique (host_actor, create_request_id)
);
create table classroom_v2_private.players (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references classroom_v2_private.rooms(id),
  actor uuid not null, alias text not null check (length(alias) between 1 and 40),
  score integer not null default 0 check (score >= 0),
  unique (room_id, id), unique (room_id, actor)
);
create table classroom_v2_private.questions (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references classroom_v2_private.rooms(id),
  index integer not null check (index >= 0), stem text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct_index smallint not null check (correct_index >= 0 and correct_index < jsonb_array_length(options)),
  content_revision text not null check (length(content_revision) between 1 and 100),
  -- Unreviewed teacher-supplied provenance; not certification or a content bank.
  teacher_draft jsonb,
  unique (room_id, id), unique (room_id, index)
);
create table classroom_v2_private.windows (
  room_id uuid not null, question_id uuid not null, opens_at timestamptz not null,
  closes_at timestamptz not null check (closes_at > opens_at),
  primary key (room_id, question_id),
  foreign key (room_id, question_id) references classroom_v2_private.questions(room_id,id)
);
create table classroom_v2_private.receipts (
  id uuid primary key default gen_random_uuid(), room_id uuid not null, player_id uuid not null, question_id uuid not null,
  accepted_choice smallint not null check (accepted_choice >= 0), is_correct boolean not null, correct_index smallint not null,
  points integer not null check (points >= 0), score_after integer not null check (score_after >= 0), accepted_at timestamptz not null,
  foreign key (room_id, player_id) references classroom_v2_private.players(room_id,id),
  foreign key (room_id, question_id) references classroom_v2_private.questions(room_id,id),
  unique (room_id, player_id, question_id)
);
alter table classroom_v2_private.hosts enable row level security;
alter table classroom_v2_private.rooms enable row level security;
alter table classroom_v2_private.players enable row level security;
alter table classroom_v2_private.questions enable row level security;
alter table classroom_v2_private.windows enable row level security;
alter table classroom_v2_private.receipts enable row level security;
revoke all on all tables in schema classroom_v2_private from public, anon, authenticated;

create function classroom_v2_private.immutable_row() returns trigger language plpgsql set search_path = '' as $$
begin raise exception using errcode='55000', message='IMMUTABLE'; end $$;
create trigger questions_immutable before update or delete on classroom_v2_private.questions for each row execute function classroom_v2_private.immutable_row();
create trigger windows_immutable before update or delete on classroom_v2_private.windows for each row execute function classroom_v2_private.immutable_row();
create trigger receipts_immutable before update or delete on classroom_v2_private.receipts for each row execute function classroom_v2_private.immutable_row();
revoke all on function classroom_v2_private.immutable_row() from public, anon, authenticated;

-- Host-created custom sample content is not reviewed or syllabus-certified.
create function public.classroom_v2_create(p_request_id uuid, p_questions jsonb, p_seconds smallint)
returns table(room_id uuid, join_code uuid, room_version bigint)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); room classroom_v2_private.rooms%rowtype; item jsonb; item_index integer := 0; created boolean;
begin
  if v_actor is null or not exists(select 1 from classroom_v2_private.hosts h where h.actor=v_actor and h.enabled) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if p_request_id is null or p_seconds is null or p_seconds not between 5 and 120 then raise exception using errcode='22023', message='INVALID_SETUP'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then raise exception using errcode='22023', message='INVALID_SETUP'; end if;
  if jsonb_array_length(p_questions) not between 1 and 20 or pg_column_size(p_questions) > 100000 then raise exception using errcode='22023', message='INVALID_SETUP'; end if;
  for item in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'stem') is distinct from 'string' or length(item->>'stem') not between 1 and 1024 or
       jsonb_typeof(item->'content_revision') is distinct from 'string' or length(item->>'content_revision') not between 1 and 100 or
       jsonb_typeof(item->'correct_index') is distinct from 'number' or (item->>'correct_index') !~ '^[0-5]$' or
       jsonb_typeof(item->'options') is distinct from 'array' then raise exception using errcode='22023', message='INVALID_CONTENT'; end if;
    if exists(select 1 from jsonb_object_keys(item) key where key not in ('stem','options','correct_index','content_revision','teacher_draft')) then
      raise exception using errcode='22023', message='INVALID_CONTENT';
    end if;
    if jsonb_array_length(item->'options') not between 2 and 6 or (item->>'correct_index')::integer >= jsonb_array_length(item->'options') or
       exists(select 1 from jsonb_array_elements(item->'options') opt where jsonb_typeof(opt) <> 'string' or length(opt #>> '{}') not between 1 and 256) then
      raise exception using errcode='22023', message='INVALID_CONTENT';
    end if;
    if item ? 'teacher_draft' then
      if jsonb_typeof(item->'teacher_draft') is distinct from 'object' then raise exception using errcode='22023', message='INVALID_TEACHER_DRAFT'; end if;
      if (select count(*) from jsonb_object_keys(item->'teacher_draft')) <> 8 or
         not (item->'teacher_draft' ?& array['id','explanation','subject','year','module','syllabusVersion','source','reviewStatus']) or
         jsonb_typeof(item->'teacher_draft'->'id') is distinct from 'string' or length(btrim(item->'teacher_draft'->>'id')) not between 1 and 100 or
         jsonb_typeof(item->'teacher_draft'->'explanation') is distinct from 'string' or length(btrim(item->'teacher_draft'->>'explanation')) not between 1 and 2000 or
         jsonb_typeof(item->'teacher_draft'->'subject') is distinct from 'string' or item->'teacher_draft'->>'subject' not in ('biology','chemistry','physics','maths-standard','maths-advanced','maths-ext1') or
         jsonb_typeof(item->'teacher_draft'->'year') is distinct from 'number' or item->'teacher_draft'->>'year' not in ('11','12') or
         jsonb_typeof(item->'teacher_draft'->'module') is distinct from 'string' or length(btrim(item->'teacher_draft'->>'module')) not between 1 and 100 or
         jsonb_typeof(item->'teacher_draft'->'syllabusVersion') is distinct from 'string' or length(btrim(item->'teacher_draft'->>'syllabusVersion')) not between 1 and 100 or
         jsonb_typeof(item->'teacher_draft'->'source') is distinct from 'string' or length(btrim(item->'teacher_draft'->>'source')) not between 1 and 200 or
         item->'teacher_draft'->>'reviewStatus' is distinct from 'unreviewed' then
        raise exception using errcode='22023', message='INVALID_TEACHER_DRAFT';
      end if;
    end if;
  end loop;
  insert into classroom_v2_private.rooms(host_actor,create_request_id,create_payload,per_question_seconds)
    values(v_actor,p_request_id,p_questions,p_seconds) on conflict(host_actor,create_request_id) do nothing returning * into room;
  created := found;
  if not created then
    select * into room from classroom_v2_private.rooms r where r.host_actor=v_actor and r.create_request_id=p_request_id;
    if room.create_payload <> p_questions or room.per_question_seconds <> p_seconds then raise exception using errcode='22023', message='IDEMPOTENCY_CONFLICT'; end if;
  else
    for item in select value from jsonb_array_elements(p_questions) loop
      insert into classroom_v2_private.questions(room_id,index,stem,options,correct_index,content_revision,teacher_draft)
        values(room.id,item_index,item->>'stem',item->'options',(item->>'correct_index')::smallint,item->>'content_revision',item->'teacher_draft');
      item_index := item_index + 1;
    end loop;
  end if;
  return query select room.id,room.join_code,room.version;
end $$;

-- Existing actor rejoin is idempotent across active/complete rooms; new joins
-- are accepted only in lobby. The join code identifies a room, not its owner.
create function public.classroom_v2_join(p_join_code uuid, p_alias text)
returns table(room_id uuid, player_id uuid, state text)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); room classroom_v2_private.rooms%rowtype; player classroom_v2_private.players%rowtype;
begin
  if v_actor is null then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if p_alias is null or length(btrim(p_alias)) not between 1 and 40 then raise exception using errcode='22023', message='INVALID_ALIAS'; end if;
  select * into room from classroom_v2_private.rooms r where r.join_code=p_join_code for update;
  if not found or clock_timestamp() >= room.expires_at then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  select * into player from classroom_v2_private.players p where p.room_id=room.id and p.actor=v_actor;
  if not found then
    if room.state <> 'lobby' then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
    insert into classroom_v2_private.players(room_id,actor,alias) values(room.id,v_actor,btrim(p_alias)) returning * into player;
  end if;
  return query select room.id,player.id,room.state;
end $$;

-- Host-only projection supplies the version needed for safe start/next and a
-- roster/answer count without granting broad reads of room or player tables.
create function public.classroom_v2_host_snapshot(p_room uuid)
returns table(room_id uuid, room_version bigint, state text, question_index integer, question_total integer,
  stem text, options jsonb, opens_at timestamptz, closes_at timestamptz, server_now timestamptz,
  answered integer, players jsonb, join_code uuid, question_report jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(
    select 1 from classroom_v2_private.rooms r join classroom_v2_private.hosts h on h.actor=r.host_actor and h.enabled
    where r.id=p_room and r.host_actor=auth.uid()
  ) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if not exists(select 1 from classroom_v2_private.rooms r where r.id=p_room and clock_timestamp()<r.expires_at) then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  return query select room.id,room.version,room.state,q.index,
    (select count(*)::integer from classroom_v2_private.questions t where t.room_id=room.id),
    q.stem,q.options,w.opens_at,w.closes_at,clock_timestamp(),
    (select count(*)::integer from classroom_v2_private.receipts rec where rec.room_id=room.id and rec.question_id=q.id),
    coalesce((select jsonb_agg(jsonb_build_object('alias',p.alias,'score',p.score) order by p.score desc,p.alias)
              from classroom_v2_private.players p where p.room_id=room.id),'[]'::jsonb), room.join_code,
    case when room.state='complete' then (
      select jsonb_agg(jsonb_build_object('index',item.index,'stem',item.stem,'opened',item.opened,'responses',item.responses,'correct',item.correct) order by item.index)
      from (select report_q.index,report_q.stem,
              exists(select 1 from classroom_v2_private.windows opened where opened.room_id=room.id and opened.question_id=report_q.id) as opened,
              (select count(*)::integer from classroom_v2_private.receipts rec where rec.room_id=room.id and rec.question_id=report_q.id) as responses,
              (select count(*)::integer from classroom_v2_private.receipts rec where rec.room_id=room.id and rec.question_id=report_q.id and rec.is_correct) as correct
            from classroom_v2_private.questions report_q where report_q.room_id=room.id) item
    ) else null end
    from classroom_v2_private.rooms room
    left join classroom_v2_private.questions q on q.room_id=room.id and q.index=room.active_index
    left join classroom_v2_private.windows w on w.room_id=room.id and w.question_id=q.id
    where room.id=p_room;
end $$;

-- A room's enabled host can review the exact frozen questions it supplied.
-- This intentionally exposes answer keys only to the verified owning host.
create function public.classroom_v2_teacher_questions(p_room uuid)
returns table(room_id uuid, question_id uuid, question_index integer, stem text, options jsonb,
  correct_index smallint, content_revision text, teacher_draft jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(
    select 1 from classroom_v2_private.rooms r join classroom_v2_private.hosts h on h.actor=r.host_actor and h.enabled
    where r.id=p_room and r.host_actor=auth.uid()
  ) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if not exists(select 1 from classroom_v2_private.rooms r where r.id=p_room and clock_timestamp()<r.expires_at) then
    raise exception using errcode='P0001', message='ROOM_UNAVAILABLE';
  end if;
  return query select q.room_id,q.id,q.index,q.stem,q.options,q.correct_index,q.content_revision,q.teacher_draft
    from classroom_v2_private.questions q where q.room_id=p_room order by q.index;
end $$;

-- Only the owner sees their own score and (after submitting) own receipt.
-- Lobby and a cancelled-before-start game return no question.
create function public.classroom_v2_snapshot(p_room uuid, p_player uuid)
returns table(room_id uuid, room_version bigint, state text, question_id uuid, question_index integer,
  stem text, options jsonb, content_revision text, opens_at timestamptz, closes_at timestamptz, server_now timestamptz,
  receipt_id uuid, accepted_choice smallint, is_correct boolean, correct_index smallint, points integer, receipt_score_after integer, score integer,
  answer_explanation text, question_total integer, final_rank integer, answer_review jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from classroom_v2_private.players p where p.id=p_player and p.room_id=p_room and p.actor=auth.uid()) then
    raise exception using errcode='42501', message='FORBIDDEN';
  end if;
  if not exists(select 1 from classroom_v2_private.rooms r where r.id=p_room and clock_timestamp()<r.expires_at) then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  return query select room.id,room.version,room.state,q.id,q.index,q.stem,q.options,q.content_revision,w.opens_at,w.closes_at,clock_timestamp(),
    r.id,r.accepted_choice,r.is_correct,r.correct_index,r.points,r.score_after,player.score,
    case when r.id is not null then q.teacher_draft->>'explanation' else null end,
    (select count(*)::integer from classroom_v2_private.questions total where total.room_id=room.id),
    case when room.state='complete' and room.active_index>=0 then 1+(select count(*)::integer from classroom_v2_private.players higher where higher.room_id=room.id and higher.score>player.score) else null end,
    case when room.state='complete' then coalesce((
      select jsonb_agg(jsonb_build_object('question_id',review_q.id,'index',review_q.index,'stem',review_q.stem,'options',review_q.options,
        'choice',review_r.accepted_choice,'correct_index',review_r.correct_index,'correct',review_r.is_correct,'points',review_r.points,
        'explanation',review_q.teacher_draft->>'explanation') order by review_q.index)
      from classroom_v2_private.receipts review_r
      join classroom_v2_private.questions review_q on review_q.room_id=review_r.room_id and review_q.id=review_r.question_id
      where review_r.room_id=room.id and review_r.player_id=player.id
    ),'[]'::jsonb) else null end
    from classroom_v2_private.rooms room join classroom_v2_private.players player on player.room_id=room.id and player.id=p_player
    left join classroom_v2_private.questions q on q.room_id=room.id and q.index=room.active_index
    left join classroom_v2_private.windows w on w.room_id=room.id and w.question_id=q.id
    left join classroom_v2_private.receipts r on r.room_id=room.id and r.player_id=player.id and r.question_id=q.id
    where room.id=p_room;
end $$;

-- Idempotent retry returns the first committed receipt, including after a host
-- advances, provided the same verified actor and unexpired room still apply.
create function public.classroom_v2_answer(p_room uuid, p_player uuid, p_question uuid, p_choice smallint)
returns table(receipt_id uuid, question_id uuid, accepted_choice smallint, is_correct boolean, correct_index smallint, points integer, score integer)
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.rooms%rowtype; q classroom_v2_private.questions%rowtype; w classroom_v2_private.windows%rowtype; rec classroom_v2_private.receipts%rowtype; now_at timestamptz; correct boolean; award integer; awarded_total integer;
begin
  if auth.uid() is null or not exists(select 1 from classroom_v2_private.players p where p.id=p_player and p.room_id=p_room and p.actor=auth.uid()) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  select * into room from classroom_v2_private.rooms t where t.id=p_room for update;
  now_at := clock_timestamp();
  if now_at >= room.expires_at then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  select * into rec from classroom_v2_private.receipts r where r.room_id=p_room and r.player_id=p_player and r.question_id=p_question;
  if found then return query select rec.id,rec.question_id,rec.accepted_choice,rec.is_correct,rec.correct_index,rec.points,rec.score_after; return; end if;
  select * into q from classroom_v2_private.questions t where t.id=p_question and t.room_id=p_room and t.index=room.active_index;
  if room.state <> 'active' or q.id is null then raise exception using errcode='P0001', message='STALE_QUESTION'; end if;
  select * into w from classroom_v2_private.windows t where t.room_id=p_room and t.question_id=q.id;
  if w.question_id is null or now_at < w.opens_at or now_at >= w.closes_at then raise exception using errcode='P0001', message='OUTSIDE_WINDOW'; end if;
  if p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(q.options) then raise exception using errcode='P0001', message='INVALID_CHOICE'; end if;
  correct := p_choice=q.correct_index; award := case when correct then 100 else 0 end;
  update classroom_v2_private.players p set score=p.score+award where p.id=p_player and p.room_id=p_room returning p.score into awarded_total;
  insert into classroom_v2_private.receipts(room_id,player_id,question_id,accepted_choice,is_correct,correct_index,points,score_after,accepted_at)
    values(p_room,p_player,p_question,p_choice,correct,q.correct_index,award,awarded_total,now_at) returning * into rec;
  update classroom_v2_private.rooms t set version=t.version+1 where t.id=p_room;
  return query select rec.id,rec.question_id,rec.accepted_choice,rec.is_correct,rec.correct_index,rec.points,rec.score_after;
end $$;

-- All host transitions share the same room lock as answer/join. A stale
-- expected-version action returns false without changing state or deadline.
create function public.classroom_v2_start(p_room uuid, p_expected_version bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.rooms%rowtype; qid uuid; opened timestamptz;
begin
  select * into room from classroom_v2_private.rooms r where r.id=p_room and r.host_actor=auth.uid() for update;
  if not found or auth.uid() is null or not exists(select 1 from classroom_v2_private.hosts h where h.actor=auth.uid() and h.enabled) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if p_expected_version is null or room.state <> 'lobby' or room.version <> p_expected_version or clock_timestamp() >= room.expires_at then return false; end if;
  -- Join and start both lock the room: whichever runs first determines whether
  -- a participant is present, without opening a round that nobody can join.
  if not exists(select 1 from classroom_v2_private.players p where p.room_id=room.id) then return false; end if;
  select q.id into qid from classroom_v2_private.questions q where q.room_id=room.id and q.index=0;
  if qid is null then raise exception using errcode='P0001', message='NO_QUESTIONS'; end if;
  opened := clock_timestamp();
  insert into classroom_v2_private.windows(room_id,question_id,opens_at,closes_at) values(room.id,qid,opened,opened + make_interval(secs=>room.per_question_seconds));
  update classroom_v2_private.rooms r set state='active',active_index=0,version=r.version+1 where r.id=p_room;
  return true;
end $$;
create function public.classroom_v2_next(p_room uuid, p_expected_version bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.rooms%rowtype; qid uuid; opened timestamptz;
begin
  select * into room from classroom_v2_private.rooms r where r.id=p_room and r.host_actor=auth.uid() for update;
  if not found or auth.uid() is null or not exists(select 1 from classroom_v2_private.hosts h where h.actor=auth.uid() and h.enabled) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if p_expected_version is null or room.state <> 'active' or room.version <> p_expected_version or clock_timestamp() >= room.expires_at then return false; end if;
  select q.id into qid from classroom_v2_private.questions q where q.room_id=room.id and q.index=room.active_index+1;
  if qid is null then update classroom_v2_private.rooms r set state='complete',version=r.version+1 where r.id=p_room; return true; end if;
  opened := clock_timestamp();
  insert into classroom_v2_private.windows(room_id,question_id,opens_at,closes_at) values(room.id,qid,opened,opened + make_interval(secs=>room.per_question_seconds));
  update classroom_v2_private.rooms r set active_index=active_index+1,version=r.version+1 where r.id=p_room;
  return true;
end $$;
create function public.classroom_v2_finish(p_room uuid, p_expected_version bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.rooms%rowtype;
begin
  select * into room from classroom_v2_private.rooms r where r.id=p_room and r.host_actor=auth.uid() for update;
  if not found or auth.uid() is null or not exists(select 1 from classroom_v2_private.hosts h where h.actor=auth.uid() and h.enabled) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if p_expected_version is null or room.state='complete' or room.version <> p_expected_version or clock_timestamp() >= room.expires_at then return false; end if;
  update classroom_v2_private.rooms r set state='complete',version=r.version+1 where r.id=p_room;
  return true;
end $$;
-- Availability metadata only, not proof that a caller owns a room or that a
-- server deployment is trusted. This candidate explicitly identifies staging.
create function public.classroom_v2_capabilities() returns table(contract_version integer, environment text, teacher_content_version integer, teacher_readback_version integer)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  return query select 1, 'staging-only'::text, 1, 1;
end $$;
revoke all on function public.classroom_v2_capabilities(), public.classroom_v2_create(uuid,jsonb,smallint), public.classroom_v2_join(uuid,text), public.classroom_v2_host_snapshot(uuid), public.classroom_v2_teacher_questions(uuid), public.classroom_v2_snapshot(uuid,uuid), public.classroom_v2_answer(uuid,uuid,uuid,smallint), public.classroom_v2_start(uuid,bigint), public.classroom_v2_next(uuid,bigint), public.classroom_v2_finish(uuid,bigint) from public, anon, authenticated;
grant execute on function public.classroom_v2_capabilities(), public.classroom_v2_create(uuid,jsonb,smallint), public.classroom_v2_join(uuid,text), public.classroom_v2_host_snapshot(uuid), public.classroom_v2_teacher_questions(uuid), public.classroom_v2_snapshot(uuid,uuid), public.classroom_v2_answer(uuid,uuid,uuid,smallint), public.classroom_v2_start(uuid,bigint), public.classroom_v2_next(uuid,bigint), public.classroom_v2_finish(uuid,bigint) to authenticated;
commit;
