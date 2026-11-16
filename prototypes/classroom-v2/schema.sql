-- ISOLATED PGLITE LAB ONLY. Never apply to production or expose lab_auth.
-- lab_auth.uid() is a deliberately forgeable test double, not verified identity.
create role lab_client nologin;
create role lab_anon nologin;
create schema lab_auth;
create schema lab_private;
create schema lab_api;
revoke all on schema lab_auth, lab_private, lab_api from public, lab_client, lab_anon;
grant usage on schema lab_api to lab_client;
create function lab_auth.uid() returns uuid language sql stable set search_path = ''
as $$ select nullif(pg_catalog.current_setting('lab.actor', true), '')::uuid $$;
revoke all on function lab_auth.uid() from public, lab_client, lab_anon;

create table lab_private.rooms (
  id uuid primary key, host_actor uuid not null, state text not null check (state in ('active','complete')),
  active_index integer not null check (active_index >= 0), version bigint not null default 0 check (version >= 0)
);
create table lab_private.players (
  id uuid primary key, room_id uuid not null references lab_private.rooms(id),
  actor uuid not null, score integer not null default 0 check (score >= 0),
  unique (room_id, id), unique (room_id, actor)
);
create table lab_private.questions (
  id uuid primary key, room_id uuid not null references lab_private.rooms(id), index integer not null check (index >= 0),
  stem text not null, options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2),
  correct_index smallint not null check (correct_index >= 0 and correct_index < jsonb_array_length(options)),
  content_revision text not null check (length(content_revision) > 0),
  opens_at timestamptz not null, closes_at timestamptz not null check (closes_at > opens_at),
  unique (room_id, id), unique (room_id, index)
);
create table lab_private.receipts (
  id uuid primary key default gen_random_uuid(), room_id uuid not null, player_id uuid not null, question_id uuid not null,
  accepted_choice smallint not null check (accepted_choice >= 0), is_correct boolean not null, correct_index smallint not null,
  points integer not null check (points >= 0), score_after integer not null check (score_after >= 0), accepted_at timestamptz not null,
  foreign key (room_id, player_id) references lab_private.players(room_id, id),
  foreign key (room_id, question_id) references lab_private.questions(room_id, id),
  unique (room_id, player_id, question_id)
);
revoke all on all tables in schema lab_private from public, lab_client, lab_anon;

-- Restrict even privileged accidental mutation after fixture creation. Deletion
-- and retention are deliberately unresolved for the real implementation.
create function lab_private.immutable_row() returns trigger language plpgsql set search_path = '' as $$
begin raise exception using errcode = '55000', message = 'IMMUTABLE'; end $$;
create trigger questions_immutable before update or delete on lab_private.questions for each row execute function lab_private.immutable_row();
create trigger receipts_immutable before update or delete on lab_private.receipts for each row execute function lab_private.immutable_row();
revoke all on function lab_private.immutable_row() from public, lab_client, lab_anon;

-- Only a verified participant actor may see the current projection and their
-- own receipt. Snapshot is one statement and never returns unanswered keys.
create function lab_api.snapshot(p_room uuid, p_player uuid)
returns table(room_id uuid, room_version bigint, state text, question_id uuid, question_index integer,
  stem text, options jsonb, content_revision text, closes_at timestamptz,
  receipt_id uuid, accepted_choice smallint, is_correct boolean, correct_index smallint, points integer, receipt_score_after integer, score integer)
language plpgsql security definer set search_path = '' as $$
begin
  if lab_auth.uid() is null or not exists (
    select 1 from lab_private.players p where p.id=p_player and p.room_id=p_room and p.actor=lab_auth.uid()
  ) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  return query select room.id,room.version,room.state,q.id,q.index,q.stem,q.options,q.content_revision,q.closes_at,
    r.id,r.accepted_choice,r.is_correct,r.correct_index,r.points,r.score_after,player.score
    from lab_private.rooms room
    join lab_private.players player on player.room_id=room.id and player.id=p_player
    join lab_private.questions q on q.room_id=room.id and q.index=room.active_index
    left join lab_private.receipts r on r.room_id=room.id and r.player_id=player.id and r.question_id=q.id
    where room.id=p_room;
end $$;

-- The room lock serializes submissions against host finish. On retry the first
-- committed result is returned before checking current phase or deadline.
create function lab_api.answer(p_room uuid, p_player uuid, p_question uuid, p_choice smallint)
returns table(receipt_id uuid, question_id uuid, accepted_choice smallint, is_correct boolean, correct_index smallint, points integer, score integer)
language plpgsql security definer set search_path = '' as $$
declare room lab_private.rooms%rowtype; q lab_private.questions%rowtype; rec lab_private.receipts%rowtype; now_at timestamptz; correct boolean; award integer; awarded_total integer;
begin
  if lab_auth.uid() is null or not exists (select 1 from lab_private.players p where p.id=p_player and p.room_id=p_room and p.actor=lab_auth.uid()) then
    raise exception using errcode='42501', message='FORBIDDEN';
  end if;
  select * into room from lab_private.rooms t where t.id=p_room for update;
  select * into rec from lab_private.receipts r where r.room_id=p_room and r.player_id=p_player and r.question_id=p_question;
  if found then
    return query select rec.id,rec.question_id,rec.accepted_choice,rec.is_correct,rec.correct_index,rec.points,rec.score_after;
    return;
  end if;
  select * into q from lab_private.questions t where t.id=p_question and t.room_id=p_room and t.index=room.active_index;
  if room.state <> 'active' or q.id is null then raise exception using errcode='P0001', message='STALE_QUESTION'; end if;
  now_at := clock_timestamp();
  if now_at < q.opens_at or now_at >= q.closes_at then raise exception using errcode='P0001', message='OUTSIDE_WINDOW'; end if;
  if p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(q.options) then raise exception using errcode='P0001', message='INVALID_CHOICE'; end if;
  correct := p_choice = q.correct_index; award := case when correct then 100 else 0 end;
  update lab_private.players p set score=p.score+award where p.id=p_player and p.room_id=p_room returning p.score into awarded_total;
  insert into lab_private.receipts(room_id,player_id,question_id,accepted_choice,is_correct,correct_index,points,score_after,accepted_at)
    values(p_room,p_player,p_question,p_choice,correct,q.correct_index,award,awarded_total,now_at) returning * into rec;
  update lab_private.rooms t set version=t.version+1 where t.id=p_room;
  return query select rec.id,rec.question_id,rec.accepted_choice,rec.is_correct,rec.correct_index,rec.points,rec.score_after;
end $$;

create function lab_api.finish(p_room uuid, p_expected_version bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room lab_private.rooms%rowtype;
begin
  select * into room from lab_private.rooms r where r.id=p_room and r.host_actor=lab_auth.uid() for update;
  if not found then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if room.state <> 'active' or room.version <> p_expected_version then return false; end if;
  update lab_private.rooms r set state='complete',version=r.version+1 where r.id=p_room;
  return true;
end $$;
revoke all on function lab_api.snapshot(uuid,uuid), lab_api.answer(uuid,uuid,uuid,smallint), lab_api.finish(uuid,bigint) from public, lab_anon, lab_client;
grant execute on function lab_api.snapshot(uuid,uuid), lab_api.answer(uuid,uuid,uuid,smallint), lab_api.finish(uuid,bigint) to lab_client;
