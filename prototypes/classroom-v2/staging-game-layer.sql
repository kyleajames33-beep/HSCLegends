-- STAGING-ONLY. Game-layer additions on top of staging-candidate.sql.
-- Applied to the dedicated "HSC Legends Staging" project only. NEVER apply to
-- production or the shared HSCScienceSyd project.
--
-- Adds: short 6-character join codes, speed-based scoring (500-1000 for a
-- correct answer), and two JSON views for the game screens (host and player)
-- with live answer counts, leaderboard, rank and streak.
-- The existing classroom_v2_* functions keep their signatures, so the staging
-- lab page keeps working.

-- Short, unambiguous join codes (no 0/O/1/I/L). Randomness comes from
-- gen_random_uuid(); bytes 0-5 of a v4 UUID are fully random.
create function classroom_v2_private.new_short_code() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; bytes bytea; code text; i integer;
begin
  loop
    bytes := uuid_send(gen_random_uuid()); code := '';
    for i in 0..5 loop code := code || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1); end loop;
    exit when not exists(select 1 from classroom_v2_private.rooms r where r.short_code = code);
  end loop;
  return code;
end $$;
revoke all on function classroom_v2_private.new_short_code() from public, anon, authenticated;

alter table classroom_v2_private.rooms add column short_code text;
update classroom_v2_private.rooms set short_code = classroom_v2_private.new_short_code() where short_code is null;
alter table classroom_v2_private.rooms alter column short_code set default classroom_v2_private.new_short_code();
alter table classroom_v2_private.rooms alter column short_code set not null;
alter table classroom_v2_private.rooms add constraint rooms_short_code_key unique (short_code);
alter table classroom_v2_private.rooms add constraint rooms_short_code_format check (short_code ~ '^[A-HJKMNP-Z2-9]{6}$');

-- Join with the short code. Reuses classroom_v2_join, so the same actor
-- binding, lobby-only new joins and idempotent rejoin rules apply.
create function public.classroom_v2_game_join(p_code text, p_alias text)
returns table(room_id uuid, player_id uuid, state text)
language plpgsql security definer set search_path = '' as $$
declare v_join uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if p_code is null or upper(btrim(p_code)) !~ '^[A-HJKMNP-Z2-9]{6}$' then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  select r.join_code into v_join from classroom_v2_private.rooms r
    where r.short_code = upper(btrim(p_code)) and clock_timestamp() < r.expires_at;
  if v_join is null then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  return query select j.room_id, j.player_id, j.state from public.classroom_v2_join(v_join, p_alias) j;
end $$;

-- Speed scoring: a correct answer earns 1000 at the instant the window opens,
-- falling linearly to 500 at the deadline. Wrong answers earn 0. Signature and
-- return type are unchanged; everything else matches staging-candidate.sql.
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

-- Host (projector) view. Only the enabled owning host may read it. It includes
-- the current answer key and per-option counts for the reveal screen; the host
-- can already read keys via classroom_v2_teacher_questions.
create function public.classroom_v2_game_host(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.rooms%rowtype; q classroom_v2_private.questions%rowtype; w classroom_v2_private.windows%rowtype;
begin
  if auth.uid() is null or not exists(
    select 1 from classroom_v2_private.rooms r join classroom_v2_private.hosts h on h.actor=r.host_actor and h.enabled
    where r.id=p_room and r.host_actor=auth.uid()
  ) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  select * into room from classroom_v2_private.rooms r where r.id=p_room;
  if clock_timestamp() >= room.expires_at then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  select * into q from classroom_v2_private.questions t where t.room_id=room.id and t.index=room.active_index;
  if q.id is not null then select * into w from classroom_v2_private.windows t where t.room_id=room.id and t.question_id=q.id; end if;
  return jsonb_build_object(
    'room_id', room.id, 'version', room.version, 'state', room.state,
    'short_code', room.short_code, 'seconds', room.per_question_seconds,
    'question_total', (select count(*) from classroom_v2_private.questions t where t.room_id=room.id),
    'question', case when q.id is null then null else jsonb_build_object(
      'id', q.id, 'index', q.index, 'stem', q.stem, 'options', q.options,
      'correct_index', q.correct_index, 'explanation', q.teacher_draft->>'explanation') end,
    'opens_at', w.opens_at, 'closes_at', w.closes_at, 'server_now', clock_timestamp(),
    'answered', case when q.id is null then 0 else (select count(*) from classroom_v2_private.receipts r where r.room_id=room.id and r.question_id=q.id) end,
    'choice_counts', case when q.id is null then null else (
      select jsonb_agg(coalesce(c.n, 0) order by s.i)
      from generate_series(0, jsonb_array_length(q.options) - 1) s(i)
      left join (select r.accepted_choice, count(*)::integer n from classroom_v2_private.receipts r
                 where r.room_id=room.id and r.question_id=q.id group by r.accepted_choice) c on c.accepted_choice=s.i) end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'alias', p.alias, 'score', p.score,
        'last_points', coalesce(r.points, 0), 'answered', r.id is not null, 'correct', r.is_correct)
        order by p.score desc, p.alias)
      from classroom_v2_private.players p
      left join classroom_v2_private.receipts r on r.room_id=p.room_id and r.player_id=p.id and r.question_id=q.id
      where p.room_id=room.id), '[]'::jsonb)
  );
end $$;

-- Player (phone) view. Only the owning actor may read it. It never includes the
-- answer key for a question this player has not answered.
create function public.classroom_v2_game_player(p_room uuid, p_player uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.rooms%rowtype; me classroom_v2_private.players%rowtype; q classroom_v2_private.questions%rowtype;
  w classroom_v2_private.windows%rowtype; rec classroom_v2_private.receipts%rowtype; streak integer := 0; item record; hit boolean;
begin
  select * into me from classroom_v2_private.players p where p.id=p_player and p.room_id=p_room;
  if auth.uid() is null or me.id is null or me.actor <> auth.uid() then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  select * into room from classroom_v2_private.rooms r where r.id=p_room;
  if clock_timestamp() >= room.expires_at then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  select * into q from classroom_v2_private.questions t where t.room_id=room.id and t.index=room.active_index;
  if q.id is not null then
    select * into w from classroom_v2_private.windows t where t.room_id=room.id and t.question_id=q.id;
    select * into rec from classroom_v2_private.receipts r where r.room_id=room.id and r.player_id=me.id and r.question_id=q.id;
  end if;
  -- Consecutive correct answers, newest first. An unanswered current question
  -- whose window is still open does not break the streak yet.
  for item in select t.id, t.index from classroom_v2_private.questions t
              join classroom_v2_private.windows ww on ww.room_id=t.room_id and ww.question_id=t.id
              where t.room_id=room.id and t.index <= room.active_index order by t.index desc loop
    select r.is_correct into hit from classroom_v2_private.receipts r where r.room_id=room.id and r.player_id=me.id and r.question_id=item.id;
    if not found then
      if item.id = q.id and room.state='active' and clock_timestamp() < w.closes_at then continue; end if;
      exit;
    end if;
    exit when not hit;
    streak := streak + 1;
  end loop;
  return jsonb_build_object(
    'room_id', room.id, 'version', room.version, 'state', room.state,
    'alias', me.alias, 'score', me.score,
    'rank', 1 + (select count(*) from classroom_v2_private.players o where o.room_id=room.id and o.score > me.score),
    'player_count', (select count(*) from classroom_v2_private.players o where o.room_id=room.id),
    'streak', streak,
    'answered', case when q.id is null then 0 else (select count(*) from classroom_v2_private.receipts r where r.room_id=room.id and r.question_id=q.id) end,
    'question_total', (select count(*) from classroom_v2_private.questions t where t.room_id=room.id),
    'question', case when q.id is null then null else jsonb_build_object('id', q.id, 'index', q.index, 'stem', q.stem, 'options', q.options) end,
    'opens_at', w.opens_at, 'closes_at', w.closes_at, 'server_now', clock_timestamp(),
    'receipt', case when rec.id is null then null else jsonb_build_object(
      'choice', rec.accepted_choice, 'correct', rec.is_correct, 'correct_index', rec.correct_index,
      'points', rec.points, 'explanation', q.teacher_draft->>'explanation') end
  );
end $$;

revoke all on function public.classroom_v2_game_join(text,text), public.classroom_v2_game_host(uuid), public.classroom_v2_game_player(uuid,uuid) from public, anon, authenticated;
grant execute on function public.classroom_v2_game_join(text,text), public.classroom_v2_game_host(uuid), public.classroom_v2_game_player(uuid,uuid) to authenticated;
-- create or replace keeps prior grants, but restate them for the replaced function.
revoke all on function public.classroom_v2_answer(uuid,uuid,uuid,smallint) from public, anon;
grant execute on function public.classroom_v2_answer(uuid,uuid,uuid,smallint) to authenticated;

-- Late joins and unique names (replaces the first version above).
-- New players may join while the game is in the lobby or active (not once it
-- is complete). A late joiner starts on 0 and plays from the current question.
-- Names must be unique within a room (case-insensitive); the same actor
-- rejoining always gets their existing player back.
create or replace function public.classroom_v2_game_join(p_code text, p_alias text)
returns table(room_id uuid, player_id uuid, state text)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); room classroom_v2_private.rooms%rowtype; player classroom_v2_private.players%rowtype; v_alias text := btrim(coalesce(p_alias, ''));
begin
  if v_actor is null then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if p_code is null or upper(btrim(p_code)) !~ '^[A-HJKMNP-Z2-9]{6}$' then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  select * into room from classroom_v2_private.rooms r where r.short_code = upper(btrim(p_code)) for update;
  if not found or clock_timestamp() >= room.expires_at or room.state = 'complete' then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  select * into player from classroom_v2_private.players p where p.room_id=room.id and p.actor=v_actor;
  if not found then
    if length(v_alias) not between 1 and 40 then raise exception using errcode='22023', message='INVALID_ALIAS'; end if;
    if exists(select 1 from classroom_v2_private.players p where p.room_id=room.id and lower(p.alias)=lower(v_alias)) then
      raise exception using errcode='P0001', message='ALIAS_TAKEN';
    end if;
    insert into classroom_v2_private.players(room_id,actor,alias) values(room.id,v_actor,v_alias) returning * into player;
  end if;
  return query select room.id, player.id, room.state;
end $$;
revoke all on function public.classroom_v2_game_join(text,text) from public, anon;
grant execute on function public.classroom_v2_game_join(text,text) to authenticated;
