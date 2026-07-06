-- Trust or Bust: Social-Gamble mode (docs/social-gamble-redesign.md)
-- The quiz powers questions; correct answers = points. Players are matched in pairs
-- each round and simultaneously choose SHARE or STEAL on a shared pot.
--
-- Simultaneous reveal integrity: clients submit choice to RPC; server collects both
-- and reveals outcomes atomically. Modifiers are server-picked and post-hoc.
--
-- Economy: points flow from question answers into a per-round pot. The outcome
-- (SHARE/STEAL/MUTUAL STEAL) determines the split. Power-ups are purchased with points.
--
-- Trust model: the client can lie about WHEN they submit (latency), but not WHAT
-- they submit (choices are locked to the RPC). Modifiers are server-authoritative
-- and cannot be gamed. Points are atomically transferred on the outcome RPC.

-- ── Game rooms ─────────────────────────────────────────────────────────────
create table if not exists public.gamble_rooms (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  subject      text not null,
  year         smallint not null check (year in (11, 12)),
  created_by   uuid,          -- null for anonymous (not-signed-in) creators
  status       text not null default 'lobby' check (status in ('lobby', 'active', 'finished')),
  round        smallint not null default 0,
  total_rounds smallint not null default 6,
  round_started_at timestamptz,
  per_q_seconds smallint not null default 18,
  starts_at   timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists gamble_rooms_code_idx on public.gamble_rooms (code);
alter table public.gamble_rooms enable row level security;
drop policy if exists gamble_rooms_read on public.gamble_rooms;
create policy gamble_rooms_read on public.gamble_rooms for select to anon, authenticated using (true);
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'gamble_rooms') then
    alter publication supabase_realtime add table public.gamble_rooms;
  end if;
end $$;

-- ── Players in a game ──────────────────────────────────────────────────────
create table if not exists public.gamble_players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null,
  user_id    uuid,
  alias      text not null,
  points     int not null default 0,
  shares     int not null default 0,  -- count of SHARE decisions
  steals     int not null default 0,  -- count of STEAL decisions
  stolen_from int not null default 0, -- count of times stolen from
  created_at timestamptz not null default now(),
  unique (room_id, alias)
);
create index if not exists gamble_players_room_idx on public.gamble_players (room_id);
alter table public.gamble_players enable row level security;
drop policy if exists gamble_players_read on public.gamble_players;
create policy gamble_players_read on public.gamble_players for select to anon, authenticated using (true);
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'gamble_players') then
    alter publication supabase_realtime add table public.gamble_players;
  end if;
end $$;

-- ── Questions per round (one row per answered question) ────────────────────
create table if not exists public.gamble_rounds (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null,
  round        smallint not null,
  question_id  uuid not null,
  stem         text not null,
  options      text[] not null,
  correct_index smallint not null,
  modifier     text not null default 'none',  -- server-picked twist
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  unique (room_id, round)
);
create index if not exists gamble_rounds_room_idx on public.gamble_rounds (room_id);
alter table public.gamble_rounds enable row level security;
drop policy if exists gamble_rounds_read on public.gamble_rounds;
create policy gamble_rounds_read on public.gamble_rounds for select to anon, authenticated using (true);
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'gamble_rounds') then
    alter publication supabase_realtime add table public.gamble_rounds;
  end if;
end $$;

-- ── Question submissions (one per player per round) ───────────────────────
create table if not exists public.gamble_submissions (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null,
  player_id    uuid not null,
  round        smallint not null,
  choice       smallint not null,
  correct      boolean not null,
  points_earned int not null default 0,
  created_at   timestamptz not null default now(),
  unique (room_id, player_id, round)
);
create index if not exists gamble_submissions_room_idx on public.gamble_submissions (room_id);
alter table public.gamble_submissions enable row level security;
drop policy if exists gamble_submissions_read on public.gamble_submissions;
create policy gamble_submissions_read on public.gamble_submissions for select to anon, authenticated using (true);

-- ── Choices (SHARE / STEAL) ───────────────────────────────────────────────
-- Stores pairing assignments and decisions for each round.
create table if not exists public.gamble_choices (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null,
  round        smallint not null,
  player_id    uuid not null,
  partner_id   uuid not null,
  choice       text check (choice in ('share', 'steal', 'pending')),
  status       text not null default 'locked' check (status in ('locked', 'revealed')),
  locked_at    timestamptz not null default now(),
  revealed_at  timestamptz,
  unique (room_id, round, player_id)
);
create index if not exists gamble_choices_round_idx on public.gamble_choices (room_id, round);
alter table public.gamble_choices enable row level security;
drop policy if exists gamble_choices_read on public.gamble_choices;
create policy gamble_choices_read on public.gamble_choices for select to anon, authenticated using (true);
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'gamble_choices') then
    alter publication supabase_realtime add table public.gamble_choices;
  end if;
end $$;

-- ── Results (outcome of a pair's reveal) ──────────────────────────────────
create table if not exists public.gamble_results (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null,
  round        smallint not null,
  player_a_id  uuid not null,
  player_b_id  uuid not null,
  choice_a     text not null,
  choice_b     text not null,
  outcome      text not null,  -- 'both_share', 'a_stole', 'b_stole', 'both_steal'
  points_a     int not null,
  points_b     int not null,
  revealed_at  timestamptz not null default now(),
  -- player_a_id is the canonical (lower uuid) side of the pair, so one row
  -- per pair per round even in rooms with multiple concurrent pairs.
  unique (room_id, round, player_a_id)
);
create index if not exists gamble_results_room_idx on public.gamble_results (room_id);
alter table public.gamble_results enable row level security;
drop policy if exists gamble_results_read on public.gamble_results;
create policy gamble_results_read on public.gamble_results for select to anon, authenticated using (true);
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'gamble_results') then
    alter publication supabase_realtime add table public.gamble_results;
  end if;
end $$;

-- ── Power-ups (purchased with points) ──────────────────────────────────────
create table if not exists public.gamble_powerups (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null,
  player_id    uuid not null,
  round        smallint not null,
  name         text not null,  -- 'peek', 'shield', 'double_pot', etc.
  cost         int not null,
  purchased_at timestamptz not null default now()
);
create index if not exists gamble_powerups_room_idx on public.gamble_powerups (room_id);
alter table public.gamble_powerups enable row level security;
drop policy if exists gamble_powerups_read on public.gamble_powerups;
create policy gamble_powerups_read on public.gamble_powerups for select to anon, authenticated using (true);

-- ── Match log (for leaderboard) ──────────────────────────────────────────
create table if not exists public.gamble_match_log (
  user_id      uuid not null,
  room_id      uuid not null,
  finished_at  timestamptz not null default now(),
  points_earned int not null default 0,
  rounds_played smallint not null default 0,
  shares       int not null default 0,
  steals       int not null default 0,
  stolen_from  int not null default 0,
  primary key (user_id, room_id)
);
alter table public.gamble_match_log enable row level security;
drop policy if exists gamble_match_log_read on public.gamble_match_log;
create policy gamble_match_log_read on public.gamble_match_log for select to anon, authenticated using (true);

-- ── RPC: Quick join (random room) or create one ──────────────────────────
create or replace function public.gamble_quick_join(
  p_subject text, p_year smallint, p_alias text
) returns table(room_id uuid, player_id uuid, code text) as $$
declare
  v_room_id uuid;
  v_player_id uuid;
  v_code text;
begin
  -- Find or create a lobby room in the subject/year (reuse existing or create new).
  select gr.id into v_room_id from public.gamble_rooms gr
  where gr.subject = p_subject and gr.year = p_year and gr.status = 'lobby'
  limit 1;

  if v_room_id is null then
    v_code := upper(substr(gen_random_uuid()::text, 1, 4));
    insert into public.gamble_rooms (code, subject, year, created_by)
    values (v_code, p_subject, p_year, auth.uid())
    returning id into v_room_id;
  else
    select gr.code into v_code from public.gamble_rooms gr where gr.id = v_room_id;
  end if;

  -- Join as a player.
  insert into public.gamble_players (room_id, user_id, alias)
  values (v_room_id, auth.uid(), p_alias)
  returning (id) into v_player_id;

  return query select v_room_id, v_player_id, v_code;
end;
$$ language plpgsql security definer;

-- ── RPC: Join by code ────────────────────────────────────────────────────
create or replace function public.gamble_join(p_code text, p_alias text)
returns table(room_id uuid, player_id uuid) as $$
declare
  v_room_id uuid;
  v_player_id uuid;
begin
  select id into v_room_id from public.gamble_rooms
  where upper(code) = upper(p_code) and status in ('lobby', 'active');

  if v_room_id is null then
    raise exception 'Room not found or game already finished.';
  end if;

  insert into public.gamble_players (room_id, user_id, alias)
  values (v_room_id, auth.uid(), p_alias)
  returning id into v_player_id;

  return query select v_room_id, v_player_id;
end;
$$ language plpgsql security definer;

-- ── RPC: Rejoin after drop ──────────────────────────────────────────────
create or replace function public.gamble_rejoin(p_code text, p_alias text)
returns table(room_id uuid, player_id uuid, points int) as $$
declare
  v_room_id uuid;
  v_player_id uuid;
  v_points int;
begin
  select g.id, p.id, p.points
  into v_room_id, v_player_id, v_points
  from public.gamble_rooms g
  join public.gamble_players p on p.room_id = g.id
  where upper(g.code) = upper(p_code) and p.alias = p_alias
  and g.status in ('lobby', 'active');

  if v_player_id is null then
    return;
  end if;

  return query select v_room_id, v_player_id, v_points;
end;
$$ language plpgsql security definer;

-- ── RPC: Get game state ─────────────────────────────────────────────────
create or replace function public.gamble_state(p_room uuid)
returns table(
  round smallint, total smallint, status text,
  stem text, options text[], question_id uuid,
  round_started_at timestamptz, per_q_seconds smallint, starts_at timestamptz,
  players int
) as $$
begin
  return query select
    gr.round, gr.total_rounds, gr.status,
    grd.stem, grd.options, grd.question_id,
    gr.round_started_at, gr.per_q_seconds, gr.starts_at,
    (select count(*) from public.gamble_players where room_id = p_room)::int
  from public.gamble_rooms gr
  left join public.gamble_rounds grd on grd.room_id = p_room and grd.round = gr.round
  where gr.id = p_room;
end;
$$ language plpgsql;

-- ── RPC: Get my state ───────────────────────────────────────────────────
create or replace function public.gamble_me(p_player uuid)
returns table(points int, shares int, steals int, stolen_from int) as $$
begin
  return query select
    gp.points, gp.shares, gp.steals, gp.stolen_from
  from public.gamble_players gp
  where gp.id = p_player;
end;
$$ language plpgsql;

-- ── RPC: Submit answer ──────────────────────────────────────────────────
create or replace function public.gamble_submit(
  p_player uuid, p_room uuid, p_round smallint, p_choice smallint
) returns table(correct boolean, correct_index smallint, points_earned int) as $$
#variable_conflict use_column
declare
  v_correct boolean;
  v_correct_idx smallint;
  v_points int;
begin
  -- Get the question's correct answer. (Qualified: the OUT parameter
  -- correct_index shadows the table column in plpgsql.)
  select gr.correct_index into v_correct_idx
  from public.gamble_rounds gr
  where gr.room_id = p_room and gr.round = p_round;

  v_correct := (p_choice = v_correct_idx);
  v_points := case when v_correct then (50 + random() * 50)::int else 5 end;

  -- Record the submission. The points are a STAKE in the round's pot — they
  -- are NOT credited here; gamble_reveal_round pays the pot out based on the
  -- share/steal outcome.
  insert into public.gamble_submissions (room_id, player_id, round, choice, correct, points_earned)
  values (p_room, p_player, p_round, p_choice, v_correct, v_points)
  on conflict (room_id, player_id, round) do update set
    choice = excluded.choice,
    correct = excluded.correct,
    points_earned = excluded.points_earned;

  return query select v_correct, v_correct_idx, v_points;
end;
$$ language plpgsql security definer;

-- ── RPC: Submit share/steal choice ──────────────────────────────────────
create or replace function public.gamble_decide(
  p_player uuid, p_room uuid, p_round smallint, p_partner uuid, p_choice text
) returns table(locked_at timestamptz) as $$
#variable_conflict use_column
declare
  v_locked_at timestamptz;
begin
  -- First choice wins: once locked, a choice can't be swapped (simultaneous-
  -- reveal integrity — you can't react to information you shouldn't have).
  insert into public.gamble_choices (room_id, round, player_id, partner_id, choice)
  values (p_room, p_round, p_player, p_partner, p_choice)
  on conflict (room_id, round, player_id) do update set choice = excluded.choice
  where gamble_choices.choice = 'pending' or gamble_choices.choice is null
  returning gamble_choices.locked_at into v_locked_at;

  if v_locked_at is null then
    select gc.locked_at into v_locked_at
    from public.gamble_choices gc
    where gc.room_id = p_room and gc.round = p_round and gc.player_id = p_player;
  end if;

  return query select v_locked_at;
end;
$$ language plpgsql security definer;

-- ── RPC: Leaderboard (season points) ────────────────────────────────────
create or replace function public.gamble_leaderboard(p_days int default 90)
returns table(
  alias text, games int, points_total int, shares int, steals int,
  is_me boolean
) as $$
begin
  -- Aggregate the match log directly (a user has one player row per room —
  -- joining players to logs would multiply the sums).
  return query
  select
    (select gp.alias from public.gamble_players gp
     where gp.user_id = gml.user_id order by gp.created_at desc limit 1),
    count(*)::int,
    sum(gml.points_earned)::int,
    sum(gml.shares)::int,
    sum(gml.steals)::int,
    (gml.user_id = auth.uid())
  from public.gamble_match_log gml
  where gml.finished_at > now() - (p_days || ' days')::interval
  group by gml.user_id
  order by sum(gml.points_earned) desc nulls last
  limit 100;
end;
$$ language plpgsql;

-- ── RPC: Finish a round (reveal and score) ──────────────────────────────
-- Called from the choices trigger when both sides of a pair have locked.
-- Pair-scoped and idempotent: the pair is canonicalised (lower uuid = side a),
-- one result row per pair per round, and the pot is PAID OUT here — question
-- points are stakes, not income, until the reveal resolves them.
create or replace function public.gamble_reveal_round(
  p_room uuid, p_round smallint, p_player_x uuid, p_player_y uuid
) returns void as $$
declare
  v_a uuid := least(p_player_x, p_player_y);
  v_b uuid := greatest(p_player_x, p_player_y);
  v_choice_a text;
  v_choice_b text;
  v_outcome text;
  v_points_a int;
  v_points_b int;
  v_pot int;
begin
  -- Already revealed for this pair? (idempotency)
  if exists (select 1 from public.gamble_results
             where room_id = p_room and round = p_round and player_a_id = v_a) then
    return;
  end if;

  select choice into v_choice_a from public.gamble_choices
  where room_id = p_room and round = p_round and player_id = v_a;
  select choice into v_choice_b from public.gamble_choices
  where room_id = p_room and round = p_round and player_id = v_b;

  -- Both sides must be locked.
  if v_choice_a is null or v_choice_a = 'pending' or v_choice_b is null or v_choice_b = 'pending' then
    return;
  end if;

  -- The pot: both players' staked question points this round.
  select coalesce(sum(points_earned), 0) into v_pot
  from public.gamble_submissions
  where room_id = p_room and round = p_round and player_id in (v_a, v_b);

  -- Determine outcome and payout. both_steal burns the pot.
  if v_choice_a = 'share' and v_choice_b = 'share' then
    v_outcome := 'both_share';
    v_points_a := (v_pot / 2)::int;
    v_points_b := v_pot - v_points_a;
  elsif v_choice_a = 'steal' and v_choice_b = 'share' then
    v_outcome := 'a_stole';
    v_points_a := v_pot;
    v_points_b := 0;
  elsif v_choice_a = 'share' and v_choice_b = 'steal' then
    v_outcome := 'b_stole';
    v_points_a := 0;
    v_points_b := v_pot;
  else
    v_outcome := 'both_steal';
    v_points_a := 0;
    v_points_b := 0;
  end if;

  -- Record the result (idempotent under the unique constraint).
  insert into public.gamble_results (
    room_id, round, player_a_id, player_b_id,
    choice_a, choice_b, outcome, points_a, points_b
  ) values (p_room, p_round, v_a, v_b, v_choice_a, v_choice_b, v_outcome, v_points_a, v_points_b)
  on conflict (room_id, round, player_a_id) do nothing;

  -- Pay the pot out. Bots have no player row, so their update is a no-op.
  update public.gamble_players set points = points + v_points_a where id = v_a;
  update public.gamble_players set points = points + v_points_b where id = v_b;

  -- Stats.
  if v_choice_a = 'share' then
    update public.gamble_players set shares = shares + 1 where id = v_a;
  else
    update public.gamble_players set steals = steals + 1 where id = v_a;
  end if;

  if v_choice_b = 'share' then
    update public.gamble_players set shares = shares + 1 where id = v_b;
  else
    update public.gamble_players set steals = steals + 1 where id = v_b;
  end if;

  if v_choice_b = 'steal' then
    update public.gamble_players set stolen_from = stolen_from + 1 where id = v_a;
  end if;

  if v_choice_a = 'steal' then
    update public.gamble_players set stolen_from = stolen_from + 1 where id = v_b;
  end if;
end;
$$ language plpgsql security definer;

-- ── RPC: Populate questions for a match (called at start) ────────────
-- Takes a JSON array of questions: [{ stem, options, correct_index }, ...]
create or replace function public.gamble_populate_questions(
  p_room uuid, p_questions jsonb
) returns void as $$
declare
  v_q jsonb;
  v_idx int := 0;
begin
  for v_q in select jsonb_array_elements(p_questions)
  loop
    insert into public.gamble_rounds (room_id, round, question_id, stem, options, correct_index, modifier)
    values (
      p_room,
      v_idx,
      gen_random_uuid(),
      v_q->>'stem',
      array(select jsonb_array_elements_text(v_q->'options')),
      (v_q->>'correct_index')::smallint,
      'none'
    )
    on conflict (room_id, round) do nothing;
    v_idx := v_idx + 1;
  end loop;

  -- total_rounds must reflect what was actually loaded, or the game points
  -- at empty rounds when the question pool comes up short.
  if v_idx > 0 then
    update public.gamble_rooms set total_rounds = v_idx
    where id = p_room and status = 'lobby';
  end if;
end;
$$ language plpgsql security definer;

-- ── RPC: Start a game (move to active, set round 0) ──────────────────
-- Lobby-only guard: a late quick-joiner calling start must not reset a
-- game already in progress.
create or replace function public.gamble_start(p_room uuid) returns void as $$
begin
  update public.gamble_rooms
  set status = 'active', round = 0, round_started_at = now()
  where id = p_room and status = 'lobby';
end;
$$ language plpgsql security definer;

-- ── RPC: Advance to next round ──────────────────────────────────────────
-- Idempotent: safe to call multiple times per round. Resets the round timer.
-- Advancing past the last round finishes the room and writes the match log
-- (the leaderboard source) for signed-in players.
create or replace function public.gamble_advance(p_room uuid, p_round smallint) returns void as $$
declare
  v_total smallint;
begin
  select total_rounds into v_total from public.gamble_rooms where id = p_room;
  if v_total is null then
    return;
  end if;

  if p_round >= v_total then
    update public.gamble_rooms
    set status = 'finished', finished_at = now()
    where id = p_room and status = 'active';

    if found then
      insert into public.gamble_match_log (user_id, room_id, points_earned, rounds_played, shares, steals, stolen_from)
      select gp.user_id, gp.room_id, gp.points, v_total, gp.shares, gp.steals, gp.stolen_from
      from public.gamble_players gp
      where gp.room_id = p_room and gp.user_id is not null
      on conflict (user_id, room_id) do nothing;
    end if;
  else
    update public.gamble_rooms
    set round = p_round, round_started_at = now()
    where id = p_room and round < p_round; -- idempotent: only advance if we're behind
  end if;
end;
$$ language plpgsql security definer;

-- ── RPC: Get all players in a room (for pairing) ────────────────────
create or replace function public.gamble_get_players(p_room uuid)
returns table(id uuid, alias text, points int, shares int, steals int, stolen_from int) as $$
begin
  return query select
    gp.id, gp.alias, gp.points, gp.shares, gp.steals, gp.stolen_from
  from public.gamble_players gp
  where gp.room_id = p_room
  order by gp.created_at;
end;
$$ language plpgsql;

-- ── RPC: Assign pairs for a round (rotating, avoiding recent repeats) ──
-- For odd count, assigns a bot to the last player.
-- Stores pairing so clients can look it up via gamble_get_partner.
create or replace function public.gamble_assign_pairs(p_room uuid, p_round smallint)
returns table(player_id uuid, partner_id uuid, is_bot boolean) as $$
#variable_conflict use_column
declare
  v_players uuid[];
  v_count int;
  v_i int;
  v_bot_id uuid;
begin
  -- Fetch all active players in the room (stable join order).
  select array_agg(id order by created_at) into v_players
  from public.gamble_players
  where room_id = p_room;

  v_count := coalesce(array_length(v_players, 1), 0);

  if v_count = 0 then
    return;
  end if;

  -- If odd count, create a bot player (deterministic UUID from room + round).
  if v_count % 2 = 1 then
    v_bot_id := (md5(p_room::text || 'bot' || p_round::text))::uuid;
    v_players := array_append(v_players, v_bot_id);
    v_count := v_count + 1;
  end if;

  -- Assign pairs (simple rotation: player[0] with player[1], player[2] with player[3], etc.)
  for v_i in 1..v_count by 2 loop
    insert into public.gamble_choices (room_id, round, player_id, partner_id, choice, status)
    values (
      p_room, p_round, v_players[v_i], v_players[v_i + 1], 'pending', 'locked'
    )
    on conflict (room_id, round, player_id) do nothing;

    insert into public.gamble_choices (room_id, round, player_id, partner_id, choice, status)
    values (
      p_room, p_round, v_players[v_i + 1], v_players[v_i], 'pending', 'locked'
    )
    on conflict (room_id, round, player_id) do nothing;

    return query select v_players[v_i], v_players[v_i + 1], (v_players[v_i + 1] = v_bot_id);
  end loop;
end;
$$ language plpgsql security definer;

-- ── RPC: Get my partner for this round ──────────────────────────────
create or replace function public.gamble_get_partner(p_player uuid, p_room uuid, p_round smallint)
returns table(partner_id uuid, alias text) as $$
begin
  return query select
    gc.partner_id,
    coalesce(gp.alias, 'Bot')
  from public.gamble_choices gc
  left join public.gamble_players gp on gp.id = gc.partner_id
  where gc.room_id = p_room and gc.round = p_round and gc.player_id = p_player;
end;
$$ language plpgsql;

-- ── RPC: Default a player to SHARE on timeout (5s window expired) ────
create or replace function public.gamble_decide_default(p_player uuid, p_room uuid, p_round smallint)
returns table(locked_at timestamptz) as $$
declare
  v_locked_at timestamptz;
begin
  -- The player's row always pre-exists (gamble_assign_pairs creates it as
  -- 'pending'), so flip it to SHARE only if no real choice was made. The
  -- conditional update never overwrites a real choice, and the reveal
  -- trigger fires only when a row actually changes.
  update public.gamble_choices gc
  set choice = 'share'
  where gc.room_id = p_room and gc.round = p_round and gc.player_id = p_player
    and gc.choice = 'pending'
  returning gc.locked_at into v_locked_at;

  -- Already locked (or no pairing row): fetch what's there.
  if v_locked_at is null then
    select gc.locked_at into v_locked_at
    from public.gamble_choices gc
    where gc.room_id = p_room and gc.round = p_round and gc.player_id = p_player;
  end if;

  return query select v_locked_at;
end;
$$ language plpgsql security definer;

-- ── RPC: Bot choice for a round (deterministic, ~70% share / ~30% steal) ──
-- Uses a seed-based RNG so it's repeatable across retries.
create or replace function public.gamble_bot_decide(
  p_bot_id uuid, p_room uuid, p_round smallint, p_partner_id uuid
) returns table(choice text) as $$
#variable_conflict use_column
declare
  v_choice text;
  v_seed int;
  v_rand int;
begin
  -- Seed: hash of bot_id + round, deterministic across calls.
  v_seed := (('x' || substring(md5(p_bot_id::text || p_round::text), 1, 8))::bit(32)::int);
  v_rand := abs(v_seed % 100)::int;
  v_choice := case when v_rand < 70 then 'share' else 'steal' end;

  insert into public.gamble_choices (room_id, round, player_id, partner_id, choice, status)
  values (p_room, p_round, p_bot_id, p_partner_id, v_choice, 'locked')
  on conflict (room_id, round, player_id) do update set choice = excluded.choice;

  return query select v_choice;
end;
$$ language plpgsql security definer;

-- ── Auto-reveal when both players have locked (trigger) ──────────────
-- When a player locks a choice, check whether THEIR PARTNER has also locked
-- (pair-scoped — a room can hold several concurrent pairs). If so, reveal
-- that pair. gamble_reveal_round is idempotent, so double-fires are safe.
create or replace function public.gamble_auto_reveal_trigger() returns trigger as $$
declare
  v_partner_choice text;
begin
  select gc.choice into v_partner_choice
  from public.gamble_choices gc
  where gc.room_id = new.room_id and gc.round = new.round and gc.player_id = new.partner_id;

  if v_partner_choice is not null and v_partner_choice != 'pending' then
    perform public.gamble_reveal_round(new.room_id, new.round, new.player_id, new.partner_id);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists gamble_auto_reveal_trigger on public.gamble_choices;
create trigger gamble_auto_reveal_trigger
after insert or update on public.gamble_choices
for each row
when (new.choice is not null and new.choice != 'pending')
execute function public.gamble_auto_reveal_trigger();

-- ── Presence: teach arena_heartbeat about gamble players ──────────────────
-- Extends the Foundation-C function (20260705_arena_robustness.sql) with a
-- gamble branch so /gamble heartbeats stop raising 'Unknown mode'.
create or replace function public.arena_heartbeat(p_mode text, p_player uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_room uuid;
begin
  if p_mode = 'knockout' then
    select room_id into v_room from public.ko_players where id = p_player;
  elsif p_mode = 'heist' then
    select room_id into v_room from public.heist_players where id = p_player;
  elsif p_mode = 'gamble' then
    select room_id into v_room from public.gamble_players where id = p_player;
  elsif p_mode = 'live' then
    select session_id into v_room from public.game_players where id = p_player;
  else
    raise exception 'Unknown mode';
  end if;
  if v_room is null then raise exception 'Unknown player'; end if;
  insert into public.arena_presence(player_id, room_id, mode, last_seen)
  values (p_player, v_room, p_mode, now())
  on conflict (player_id) do update set last_seen = now();
end $$;

-- Allow gamble in the presence mode check (arena_presence is from 20260705).
alter table public.arena_presence drop constraint if exists arena_presence_mode_check;
alter table public.arena_presence add constraint arena_presence_mode_check
  check (mode in ('knockout', 'heist', 'gamble', 'live'));
