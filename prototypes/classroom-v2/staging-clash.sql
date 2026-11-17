-- STAGING-ONLY. Reactor Clash multiplayer rooms.
--
-- The host's browser runs the game simulation and relays state over Realtime
-- broadcast. The database owns what must not be faked: who is in the room (with
-- a per-player secret token the host uses to verify inputs) and every question
-- answer. Energy is only granted for answers recorded here.

create function classroom_v2_private.new_clash_code() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; bytes bytea; code text; i integer;
begin
  loop
    bytes := uuid_send(gen_random_uuid()); code := '';
    for i in 0..5 loop code := code || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1); end loop;
    exit when not exists(select 1 from classroom_v2_private.clash_rooms r where r.short_code = code);
  end loop;
  return code;
end $$;

create table classroom_v2_private.clash_rooms (
  id uuid primary key default gen_random_uuid(),
  host_actor uuid not null,
  short_code text not null unique,
  state text not null default 'lobby' check (state in ('lobby','active','complete')),
  pool jsonb not null check (jsonb_typeof(pool)='array' and jsonb_array_length(pool) between 1 and 300),
  seconds integer not null default 240 check (seconds between 60 and 900),
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  expires_at timestamptz not null default (clock_timestamp() + interval '6 hours'),
  results jsonb
);
alter table classroom_v2_private.clash_rooms alter column short_code set default classroom_v2_private.new_clash_code();

create table classroom_v2_private.clash_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references classroom_v2_private.clash_rooms(id),
  actor uuid not null,
  alias text not null check (length(alias) between 1 and 24),
  team text not null check (team in ('blue','orange')),
  token uuid not null default gen_random_uuid(),
  joined_at timestamptz not null default clock_timestamp(),
  unique (room_id, actor)
);
create unique index clash_players_alias on classroom_v2_private.clash_players(room_id, lower(alias));

create sequence classroom_v2_private.clash_answer_seq;
create table classroom_v2_private.clash_issues (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references classroom_v2_private.clash_rooms(id),
  player_id uuid not null references classroom_v2_private.clash_players(id),
  q_index integer not null,
  issued_at timestamptz not null default clock_timestamp(),
  answered_at timestamptz, choice smallint, correct boolean, seq bigint
);
create index clash_issues_player on classroom_v2_private.clash_issues(player_id, issued_at desc);
create index clash_issues_seq on classroom_v2_private.clash_issues(room_id, seq);

alter table classroom_v2_private.clash_rooms enable row level security;
alter table classroom_v2_private.clash_players enable row level security;
alter table classroom_v2_private.clash_issues enable row level security;
revoke all on classroom_v2_private.clash_rooms, classroom_v2_private.clash_players, classroom_v2_private.clash_issues from public, anon, authenticated;
revoke all on function classroom_v2_private.new_clash_code() from public, anon, authenticated;

-- Shared guards -------------------------------------------------------------------
create function classroom_v2_private.clash_owned_room(p_room uuid) returns classroom_v2_private.clash_rooms
language plpgsql stable set search_path = '' as $$
declare room classroom_v2_private.clash_rooms;
begin
  perform classroom_v2_private.require_host();
  select * into room from classroom_v2_private.clash_rooms r where r.id=p_room and r.host_actor=auth.uid();
  if room.id is null then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if clock_timestamp() >= room.expires_at then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  return room;
end $$;
create function classroom_v2_private.clash_own_player(p_room uuid, p_player uuid) returns classroom_v2_private.clash_players
language plpgsql stable set search_path = '' as $$
declare me classroom_v2_private.clash_players;
begin
  select * into me from classroom_v2_private.clash_players p where p.id=p_player and p.room_id=p_room;
  if auth.uid() is null or me.id is null or me.actor <> auth.uid() then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  return me;
end $$;
revoke all on function classroom_v2_private.clash_owned_room(uuid), classroom_v2_private.clash_own_player(uuid,uuid) from public, anon, authenticated;

-- Host --------------------------------------------------------------------------
create function public.clash_create(p_questions jsonb, p_seconds integer) returns table(room_id uuid, short_code text)
language plpgsql security definer set search_path = '' as $$
declare v_host uuid := classroom_v2_private.require_host(); item jsonb; room classroom_v2_private.clash_rooms;
begin
  if p_seconds is null or p_seconds not between 60 and 900 then raise exception using errcode='22023', message='INVALID_SETUP'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) not between 1 and 300 or pg_column_size(p_questions) > 1500000 then
    raise exception using errcode='22023', message='INVALID_CONTENT';
  end if;
  for item in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(item->'stem') is distinct from 'string' or jsonb_typeof(item->'options') is distinct from 'array'
       or jsonb_array_length(item->'options') not between 2 and 6 or jsonb_typeof(item->'correct_index') is distinct from 'number'
       or (item->>'correct_index')::integer not between 0 and jsonb_array_length(item->'options') - 1 then
      raise exception using errcode='22023', message='INVALID_CONTENT';
    end if;
  end loop;
  insert into classroom_v2_private.clash_rooms(host_actor, pool, seconds) values (v_host, p_questions, p_seconds) returning * into room;
  return query select room.id, room.short_code;
end $$;

create function public.clash_host_view(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.clash_rooms := classroom_v2_private.clash_owned_room(p_room);
begin
  return jsonb_build_object('room_id', room.id, 'short_code', room.short_code, 'state', room.state, 'seconds', room.seconds,
    'pool_size', jsonb_array_length(room.pool), 'results', room.results,
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'alias', p.alias, 'team', p.team, 'token', p.token) order by p.joined_at)
      from classroom_v2_private.clash_players p where p.room_id=room.id), '[]'::jsonb));
end $$;

create function public.clash_set_team(p_room uuid, p_player uuid, p_team text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.clash_rooms := classroom_v2_private.clash_owned_room(p_room);
begin
  if p_team not in ('blue','orange') then raise exception using errcode='22023', message='INVALID_SETUP'; end if;
  update classroom_v2_private.clash_players p set team=p_team where p.id=p_player and p.room_id=room.id;
  return found;
end $$;

create function public.clash_start(p_room uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.clash_rooms := classroom_v2_private.clash_owned_room(p_room);
begin
  update classroom_v2_private.clash_rooms r set state='active', started_at=clock_timestamp() where r.id=room.id and r.state='lobby';
  return found;
end $$;

create function public.clash_finish(p_room uuid, p_results jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.clash_rooms := classroom_v2_private.clash_owned_room(p_room);
begin
  if p_results is not null and pg_column_size(p_results) > 200000 then raise exception using errcode='22023', message='INVALID_SETUP'; end if;
  update classroom_v2_private.clash_rooms r set state='complete', results=p_results where r.id=room.id and r.state <> 'complete';
  return found;
end $$;

-- Answers recorded after p_since (by sequence number), so the host can grant energy.
create function public.clash_receipts(p_room uuid, p_since bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.clash_rooms := classroom_v2_private.clash_owned_room(p_room);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('seq', i.seq, 'player_id', i.player_id, 'correct', i.correct) order by i.seq)
    from classroom_v2_private.clash_issues i where i.room_id=room.id and i.seq > coalesce(p_since, 0)), '[]'::jsonb);
end $$;

-- Per-student results for the teacher.
create function public.clash_report(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.clash_rooms := classroom_v2_private.clash_owned_room(p_room);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('alias', p.alias, 'team', p.team,
      'answered', (select count(*) from classroom_v2_private.clash_issues i where i.player_id=p.id and i.answered_at is not null),
      'correct', (select count(*) from classroom_v2_private.clash_issues i where i.player_id=p.id and i.correct),
      'missed', coalesce((select jsonb_agg(distinct room.pool->i.q_index->>'stem') from classroom_v2_private.clash_issues i where i.player_id=p.id and i.correct = false), '[]'::jsonb))
    order by p.alias) from classroom_v2_private.clash_players p where p.room_id=room.id), '[]'::jsonb);
end $$;

-- Students --------------------------------------------------------------------------
create function public.clash_join(p_code text, p_alias text) returns table(room_id uuid, player_id uuid, team text, token uuid, state text)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); room classroom_v2_private.clash_rooms; me classroom_v2_private.clash_players; v_alias text := btrim(coalesce(p_alias, '')); v_team text;
begin
  if v_actor is null then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if p_code is null or upper(btrim(p_code)) !~ '^[A-HJKMNP-Z2-9]{6}$' then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  select * into room from classroom_v2_private.clash_rooms r where r.short_code=upper(btrim(p_code)) for update;
  if room.id is null or clock_timestamp() >= room.expires_at or room.state='complete' then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  select * into me from classroom_v2_private.clash_players p where p.room_id=room.id and p.actor=v_actor;
  if me.id is null then
    if length(v_alias) not between 1 and 24 then raise exception using errcode='22023', message='INVALID_ALIAS'; end if;
    if exists(select 1 from classroom_v2_private.clash_players p where p.room_id=room.id and lower(p.alias)=lower(v_alias)) then raise exception using errcode='P0001', message='ALIAS_TAKEN'; end if;
    if (select count(*) from classroom_v2_private.clash_players p where p.room_id=room.id) >= 60 then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
    select case when count(*) filter (where p.team='orange') < count(*) filter (where p.team='blue') then 'orange' else 'blue' end into v_team
      from classroom_v2_private.clash_players p where p.room_id=room.id;
    insert into classroom_v2_private.clash_players(room_id, actor, alias, team) values (room.id, v_actor, v_alias, v_team) returning * into me;
  end if;
  return query select room.id, me.id, me.team, me.token, room.state;
end $$;

create function public.clash_me(p_room uuid, p_player uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me classroom_v2_private.clash_players := classroom_v2_private.clash_own_player(p_room, p_player); room classroom_v2_private.clash_rooms;
begin
  select * into room from classroom_v2_private.clash_rooms r where r.id=p_room;
  if clock_timestamp() >= room.expires_at then raise exception using errcode='P0001', message='ROOM_UNAVAILABLE'; end if;
  return jsonb_build_object('state', room.state, 'alias', me.alias, 'team', me.team, 'token', me.token, 'seconds', room.seconds, 'results', room.results,
    'answered', (select count(*) from classroom_v2_private.clash_issues i where i.player_id=me.id and i.answered_at is not null),
    'correct', (select count(*) from classroom_v2_private.clash_issues i where i.player_id=me.id and i.correct));
end $$;

-- A question for this player (no answer key). An unanswered question issued in
-- the last 90 seconds is returned again, so refreshing cannot re-roll it.
create function public.clash_question(p_room uuid, p_player uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me classroom_v2_private.clash_players := classroom_v2_private.clash_own_player(p_room, p_player); room classroom_v2_private.clash_rooms; iss classroom_v2_private.clash_issues; n integer; pick integer; tries integer := 0;
begin
  select * into room from classroom_v2_private.clash_rooms r where r.id=p_room;
  if room.state <> 'active' or clock_timestamp() >= room.expires_at then raise exception using errcode='P0001', message='STALE_QUESTION'; end if;
  select * into iss from classroom_v2_private.clash_issues i where i.player_id=me.id and i.answered_at is null and i.issued_at > clock_timestamp() - interval '90 seconds' order by i.issued_at desc limit 1;
  if iss.id is null then
    n := jsonb_array_length(room.pool);
    loop
      pick := floor(random() * n)::integer;
      tries := tries + 1;
      exit when tries > 8 or n <= 10 or not exists(select 1 from (select i.q_index from classroom_v2_private.clash_issues i where i.player_id=me.id order by i.issued_at desc limit least(10, n - 1)) recent where recent.q_index=pick);
    end loop;
    insert into classroom_v2_private.clash_issues(room_id, player_id, q_index) values (room.id, me.id, pick) returning * into iss;
  end if;
  return jsonb_build_object('issue_id', iss.id, 'stem', room.pool->iss.q_index->>'stem', 'options', room.pool->iss.q_index->'options');
end $$;

create function public.clash_answer(p_room uuid, p_player uuid, p_issue uuid, p_choice smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me classroom_v2_private.clash_players := classroom_v2_private.clash_own_player(p_room, p_player); room classroom_v2_private.clash_rooms; iss classroom_v2_private.clash_issues; q jsonb;
begin
  select * into room from classroom_v2_private.clash_rooms r where r.id=p_room;
  select * into iss from classroom_v2_private.clash_issues i where i.id=p_issue and i.player_id=me.id for update;
  if iss.id is null then raise exception using errcode='P0001', message='STALE_QUESTION'; end if;
  q := room.pool->iss.q_index;
  if iss.answered_at is null then
    if room.state <> 'active' then raise exception using errcode='P0001', message='STALE_QUESTION'; end if;
    if p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(q->'options') then raise exception using errcode='P0001', message='INVALID_CHOICE'; end if;
    update classroom_v2_private.clash_issues i set answered_at=clock_timestamp(), choice=p_choice, correct=(p_choice=(q->>'correct_index')::integer),
      seq=nextval('classroom_v2_private.clash_answer_seq') where i.id=iss.id returning * into iss;
  end if;
  return jsonb_build_object('correct', iss.correct, 'choice', iss.choice, 'correct_index', (q->>'correct_index')::integer, 'explanation', q->'teacher_draft'->>'explanation');
end $$;

revoke all on function public.clash_create(jsonb,integer), public.clash_host_view(uuid), public.clash_set_team(uuid,uuid,text), public.clash_start(uuid), public.clash_finish(uuid,jsonb),
  public.clash_receipts(uuid,bigint), public.clash_report(uuid), public.clash_join(text,text), public.clash_me(uuid,uuid), public.clash_question(uuid,uuid), public.clash_answer(uuid,uuid,uuid,smallint)
  from public, anon, authenticated;
grant execute on function public.clash_create(jsonb,integer), public.clash_host_view(uuid), public.clash_set_team(uuid,uuid,text), public.clash_start(uuid), public.clash_finish(uuid,jsonb),
  public.clash_receipts(uuid,bigint), public.clash_report(uuid), public.clash_join(text,text), public.clash_me(uuid,uuid), public.clash_question(uuid,uuid), public.clash_answer(uuid,uuid,uuid,smallint)
  to authenticated;
