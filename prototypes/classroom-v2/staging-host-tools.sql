-- STAGING-ONLY. Host tools on top of staging-boss-battle.sql:
--   * classroom_v2_game_close: the host ends the current question early.
--   * classroom_v2_game_report: per-student results for the host.

-- Answer windows are immutable, so an early close is recorded separately.
create table classroom_v2_private.closures (
  room_id uuid not null, question_id uuid not null, closed_at timestamptz not null,
  primary key (room_id, question_id),
  foreign key (room_id, question_id) references classroom_v2_private.questions(room_id, id)
);
alter table classroom_v2_private.closures enable row level security;
revoke all on classroom_v2_private.closures from public, anon, authenticated;

-- Host-only. Closes the current question now (idempotent). Takes the room lock
-- so it serializes with answers: an answer either commits before the close or
-- is rejected as OUTSIDE_WINDOW.
create function public.classroom_v2_game_close(p_room uuid, p_question uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.rooms%rowtype; qid uuid;
begin
  select * into room from classroom_v2_private.rooms r where r.id=p_room and r.host_actor=auth.uid() for update;
  if not found or auth.uid() is null or not exists(select 1 from classroom_v2_private.hosts h where h.actor=auth.uid() and h.enabled) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  select q.id into qid from classroom_v2_private.questions q where q.room_id=room.id and q.index=room.active_index;
  if room.state <> 'active' or qid is null or qid <> p_question or clock_timestamp() >= room.expires_at then return false; end if;
  insert into classroom_v2_private.closures(room_id, question_id, closed_at) values (room.id, qid, clock_timestamp()) on conflict do nothing;
  update classroom_v2_private.rooms r set version=r.version+1 where r.id=room.id;
  return true;
end $$;

-- Answer with the early-close rule added; otherwise identical to the
-- staging-game-layer.sql version (speed scoring 500-1000).
create or replace function public.classroom_v2_answer(p_room uuid, p_player uuid, p_question uuid, p_choice smallint)
returns table(receipt_id uuid, question_id uuid, accepted_choice smallint, is_correct boolean, correct_index smallint, points integer, score integer)
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.rooms%rowtype; q classroom_v2_private.questions%rowtype; w classroom_v2_private.windows%rowtype; rec classroom_v2_private.receipts%rowtype; now_at timestamptz; correct boolean; award integer; awarded_total integer; elapsed numeric; span numeric;
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
  if exists(select 1 from classroom_v2_private.closures c where c.room_id=p_room and c.question_id=q.id and c.closed_at <= now_at) then raise exception using errcode='P0001', message='OUTSIDE_WINDOW'; end if;
  if p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(q.options) then raise exception using errcode='P0001', message='INVALID_CHOICE'; end if;
  correct := p_choice=q.correct_index;
  elapsed := extract(epoch from (now_at - w.opens_at)); span := extract(epoch from (w.closes_at - w.opens_at));
  award := case when correct then greatest(500, least(1000, round(1000 - 500 * elapsed / span)))::integer else 0 end;
  update classroom_v2_private.players p set score=p.score+award where p.id=p_player and p.room_id=p_room returning p.score into awarded_total;
  insert into classroom_v2_private.receipts(room_id,player_id,question_id,accepted_choice,is_correct,correct_index,points,score_after,accepted_at)
    values(p_room,p_player,p_question,p_choice,correct,q.correct_index,award,awarded_total,now_at) returning * into rec;
  update classroom_v2_private.rooms t set version=t.version+1 where t.id=p_room;
  return query select rec.id,rec.question_id,rec.accepted_choice,rec.is_correct,rec.correct_index,rec.points,rec.score_after;
end $$;

-- Effective deadline for the current question (early close or window end).
create function classroom_v2_private.effective_close(p_room uuid) returns timestamptz language sql stable set search_path = '' as $$
  select least(w.closes_at, c.closed_at)
  from classroom_v2_private.rooms r
  join classroom_v2_private.questions q on q.room_id=r.id and q.index=r.active_index
  join classroom_v2_private.windows w on w.room_id=r.id and w.question_id=q.id
  left join classroom_v2_private.closures c on c.room_id=r.id and c.question_id=q.id
  where r.id=p_room
$$;
revoke all on function classroom_v2_private.effective_close(uuid) from public, anon, authenticated;

-- Views report the effective deadline, so both screens move to the reveal.
create or replace function public.classroom_v2_game_host(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare base jsonb := classroom_v2_private.classroom_v2_game_host_base(p_room);
begin
  return base || jsonb_build_object('mode', (select r.game_mode from classroom_v2_private.rooms r where r.id=p_room), 'boss', classroom_v2_private.boss_json(p_room))
    || case when base->>'closes_at' is null then '{}'::jsonb else jsonb_build_object('closes_at', classroom_v2_private.effective_close(p_room)) end;
end $$;
create or replace function public.classroom_v2_game_player(p_room uuid, p_player uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare base jsonb := classroom_v2_private.classroom_v2_game_player_base(p_room, p_player);
begin
  return base || jsonb_build_object('mode', (select r.game_mode from classroom_v2_private.rooms r where r.id=p_room), 'boss', classroom_v2_private.boss_json(p_room))
    || case when base->>'closes_at' is null then '{}'::jsonb else jsonb_build_object('closes_at', classroom_v2_private.effective_close(p_room)) end;
end $$;

-- Host-only per-student results: every player x every opened question.
create function public.classroom_v2_game_report(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(
    select 1 from classroom_v2_private.rooms r join classroom_v2_private.hosts h on h.actor=r.host_actor and h.enabled
    where r.id=p_room and r.host_actor=auth.uid()
  ) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  return jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('index', q.index, 'stem', q.stem, 'options', q.options, 'correct_index', q.correct_index,
        'opened', exists(select 1 from classroom_v2_private.windows w where w.room_id=q.room_id and w.question_id=q.id)) order by q.index)
      from classroom_v2_private.questions q where q.room_id=p_room), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object('alias', p.alias, 'score', p.score,
        'answers', coalesce((select jsonb_agg(jsonb_build_object('index', q.index, 'choice', x.accepted_choice, 'correct', x.is_correct, 'points', x.points) order by q.index)
          from classroom_v2_private.receipts x join classroom_v2_private.questions q on q.room_id=x.room_id and q.id=x.question_id
          where x.room_id=p_room and x.player_id=p.id), '[]'::jsonb)) order by p.score desc, p.alias)
      from classroom_v2_private.players p where p.room_id=p_room), '[]'::jsonb)
  );
end $$;

revoke all on function public.classroom_v2_game_close(uuid,uuid), public.classroom_v2_game_report(uuid) from public, anon, authenticated;
grant execute on function public.classroom_v2_game_close(uuid,uuid), public.classroom_v2_game_report(uuid) to authenticated;
revoke all on function public.classroom_v2_answer(uuid,uuid,uuid,smallint), public.classroom_v2_game_host(uuid), public.classroom_v2_game_player(uuid,uuid) from public, anon;
grant execute on function public.classroom_v2_answer(uuid,uuid,uuid,smallint), public.classroom_v2_game_host(uuid), public.classroom_v2_game_player(uuid,uuid) to authenticated;
