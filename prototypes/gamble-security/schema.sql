-- ISOLATED SECURITY EXPERIMENT. Do not apply to an existing database.
-- lab_auth.uid() simulates a verified JWT subject in tests; a setting is NOT
-- a credential and must never be exposed as an authorization boundary.
create role lab_player nologin;
create schema lab_auth;
create function lab_auth.uid() returns text language sql stable as $$
  select nullif(current_setting('lab.test_subject', true), '')
$$;
create schema game_private;
create schema game_api;
revoke all on schema game_private from public;
revoke all on schema game_api from public;
create table game_private.rooms(id text primary key, round integer not null, phase text not null check (phase in ('answer','decide','finished')), deadline timestamptz not null);
create table game_private.players(id text primary key, room_id text not null references game_private.rooms(id), subject text not null, points integer not null default 0, unique(room_id, subject), unique(room_id,id));
create table game_private.questions(room_id text not null references game_private.rooms(id), round integer not null, stem text not null, options text[] not null check(cardinality(options) >= 2), correct_index integer not null, primary key(room_id,round), check(correct_index >= 0 and correct_index < cardinality(options)));
create table game_private.pairs(room_id text not null references game_private.rooms(id), round integer not null, player_a text not null, player_b text not null, primary key(room_id,round,player_a), unique(room_id,round,player_b), check(player_a < player_b), foreign key(room_id,player_a) references game_private.players(room_id,id), foreign key(room_id,player_b) references game_private.players(room_id,id));
create table game_private.answers(room_id text not null, round integer not null, player_id text not null, choice integer not null, correct boolean not null, stake integer not null, primary key(room_id,round,player_id), foreign key(room_id,player_id) references game_private.players(room_id,id));
create table game_private.decisions(room_id text not null, round integer not null, player_id text not null, choice text not null check(choice in ('share','steal')), primary key(room_id,round,player_id), foreign key(room_id,player_id) references game_private.players(room_id,id));
create table game_private.results(room_id text not null, round integer not null, player_a text not null, player_b text not null, decision_a text not null, decision_b text not null, payout_a integer not null, payout_b integer not null, primary key(room_id,round,player_a));

-- Test principals stand in for auth.uid(); live integration must replace this.
create function game_private.assert_owner(p_room text,p_player text) returns void language plpgsql security definer set search_path = pg_catalog, game_private, lab_auth as $$
begin
  if lab_auth.uid() is null or not exists(select 1 from game_private.players where id=p_player and room_id=p_room and subject=lab_auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
end $$;
-- Pair creation is outside this lab. Refuse corrupted or overlapping pairings
-- instead of choosing one arbitrarily; it must be unique for both players.
create function game_private.checked_pair(p_room text,p_round integer,p_player text) returns game_private.pairs language plpgsql security definer set search_path=pg_catalog,game_private as $$
declare v_pair game_private.pairs%rowtype; n integer;
begin
  select count(*) into n from game_private.pairs where room_id=p_room and round=p_round and (player_a=p_player or player_b=p_player);
  if n <> 1 then raise exception 'invalid pairing'; end if;
  select * into v_pair from game_private.pairs where room_id=p_room and round=p_round and (player_a=p_player or player_b=p_player);
  select count(*) into n from game_private.pairs where room_id=p_room and round=p_round and (player_a=v_pair.player_a or player_b=v_pair.player_a);
  if n <> 1 then raise exception 'invalid pairing'; end if;
  select count(*) into n from game_private.pairs where room_id=p_room and round=p_round and (player_a=v_pair.player_b or player_b=v_pair.player_b);
  if n <> 1 then raise exception 'invalid pairing'; end if;
  return v_pair;
end $$;
create function game_api.question(p_room text,p_player text) returns table(round integer,stem text,options text[]) language plpgsql security definer set search_path=pg_catalog,game_private,lab_auth as $$
begin
  perform game_private.assert_owner(p_room,p_player);
  return query select q.round,q.stem,q.options from game_private.questions q join game_private.rooms r on r.id=q.room_id and r.round=q.round where r.id=p_room and r.phase='answer' and r.deadline > clock_timestamp();
end $$;
create function game_api.submit(p_room text,p_round integer,p_player text,p_choice integer) returns table(choice integer,correct boolean,stake integer) language plpgsql security definer set search_path=pg_catalog,game_private,lab_auth as $$
declare r game_private.rooms%rowtype; q game_private.questions%rowtype; a game_private.answers%rowtype;
begin
  perform game_private.assert_owner(p_room,p_player);
  select * into r from game_private.rooms where id=p_room for update;
  if not found or p_round is null or r.round <> p_round then raise exception 'wrong round'; end if;
  select * into a from game_private.answers where room_id=p_room and round=p_round and player_id=p_player;
  if found then return query select a.choice,a.correct,a.stake; return; end if;
  if r.phase <> 'answer' or r.deadline <= clock_timestamp() then raise exception 'answer phase closed'; end if;
  select * into q from game_private.questions where room_id=p_room and round=p_round;
  if not found or p_choice is null or p_choice < 0 or p_choice >= cardinality(q.options) then raise exception 'invalid answer'; end if;
  insert into game_private.answers(room_id,round,player_id,choice,correct,stake) values(p_room,p_round,p_player,p_choice,p_choice=q.correct_index,case when p_choice=q.correct_index then 10 else 0 end) returning * into a;
  return query select a.choice,a.correct,a.stake;
end $$;
create function game_api.decide(p_room text,p_round integer,p_player text,p_choice text) returns text language plpgsql security definer set search_path=pg_catalog,game_private,lab_auth as $$
declare r game_private.rooms%rowtype; v_choice text;
begin
  perform game_private.assert_owner(p_room,p_player);
  select * into r from game_private.rooms where id=p_room for update;
  if not found or p_round is null or r.round <> p_round then raise exception 'wrong round'; end if;
  select choice into v_choice from game_private.decisions where room_id=p_room and round=p_round and player_id=p_player;
  if found then return v_choice; end if;
  if r.phase <> 'decide' or r.deadline <= clock_timestamp() then raise exception 'decision phase closed'; end if;
  if p_choice is null or p_choice not in ('share','steal') then raise exception 'invalid decision'; end if;
  perform game_private.checked_pair(p_room,p_round,p_player);
  insert into game_private.decisions values(p_room,p_round,p_player,p_choice);
  return p_choice;
end $$;
create function game_api.reveal(p_room text,p_round integer,p_player text) returns table(decision_a text,decision_b text,payout_a integer,payout_b integer) language plpgsql security definer set search_path=pg_catalog,game_private,lab_auth as $$
declare r game_private.rooms%rowtype; pair game_private.pairs%rowtype; da text; db text; sa integer; sb integer; pa integer; pb integer; inserted boolean;
begin
  perform game_private.assert_owner(p_room,p_player);
  select * into r from game_private.rooms where id=p_room for update;
  if not found or p_round is null or r.round <> p_round or r.phase <> 'decide' then raise exception 'wrong phase'; end if;
  pair := game_private.checked_pair(p_room,p_round,p_player);
  select d.choice into da from game_private.decisions d where d.room_id=p_room and d.round=p_round and d.player_id=pair.player_a;
  select d.choice into db from game_private.decisions d where d.room_id=p_room and d.round=p_round and d.player_id=pair.player_b;
  if da is null or db is null then raise exception 'decisions not locked'; end if;
  select coalesce((select stake from game_private.answers where room_id=p_room and round=p_round and player_id=pair.player_a),0) into sa;
  select coalesce((select stake from game_private.answers where room_id=p_room and round=p_round and player_id=pair.player_b),0) into sb;
  if da='share' and db='share' then pa:=sa; pb:=sb;
  elsif da='steal' and db='share' then pa:=sa+sb; pb:=0;
  elsif da='share' and db='steal' then pa:=0; pb:=sa+sb;
  else pa:=0; pb:=0; end if;
  insert into game_private.results values(p_room,p_round,pair.player_a,pair.player_b,da,db,pa,pb)
    on conflict(room_id,round,player_a) do nothing returning true into inserted;
  if coalesce(inserted,false) then
    update game_private.players set points=points+pa where room_id=p_room and id=pair.player_a;
    update game_private.players set points=points+pb where room_id=p_room and id=pair.player_b;
  end if;
  return query select x.decision_a,x.decision_b,x.payout_a,x.payout_b from game_private.results x where x.room_id=p_room and x.round=p_round and x.player_a=pair.player_a;
end $$;
-- Reconnect snapshot exposes the player's own receipts and only published
-- result data. It never returns the correct index or the opponent's pending
-- choice. Server-owned timestamps are sent as data, not a client assertion.
create function game_api.snapshot(p_room text,p_player text) returns jsonb language plpgsql security definer set search_path=pg_catalog,game_private,lab_auth as $$
declare r game_private.rooms%rowtype; v_question jsonb; v_answer jsonb; v_decision text; v_result jsonb;
begin
  perform game_private.assert_owner(p_room,p_player);
  select * into r from game_private.rooms where id=p_room;
  if not found then raise exception 'room not found'; end if;
  if r.phase='answer' and r.deadline > clock_timestamp() then
    select jsonb_build_object('stem',q.stem,'options',q.options) into v_question from game_private.questions q where q.room_id=p_room and q.round=r.round;
  end if;
  select jsonb_build_object('choice',a.choice,'correct',a.correct,'stake',a.stake) into v_answer from game_private.answers a where a.room_id=p_room and a.round=r.round and a.player_id=p_player;
  select d.choice into v_decision from game_private.decisions d where d.room_id=p_room and d.round=r.round and d.player_id=p_player;
  select jsonb_build_object('player_a',x.player_a,'player_b',x.player_b,'decision_a',x.decision_a,'decision_b',x.decision_b,'payout_a',x.payout_a,'payout_b',x.payout_b) into v_result from game_private.results x where x.room_id=p_room and x.round=r.round and (x.player_a=p_player or x.player_b=p_player);
  return jsonb_build_object('round',r.round,'phase',r.phase,'deadline',r.deadline,'question',v_question,'own_answer',v_answer,'own_decision',v_decision,'result',v_result);
end $$;
revoke all on all tables in schema game_private from public,lab_player;
revoke all on all functions in schema game_private from public,lab_player;
revoke all on all functions in schema game_api from public;
grant usage on schema game_api to lab_player;
grant execute on function game_api.question(text,text),game_api.snapshot(text,text),game_api.submit(text,integer,text,integer),game_api.decide(text,integer,text,text),game_api.reveal(text,integer,text) to lab_player;
