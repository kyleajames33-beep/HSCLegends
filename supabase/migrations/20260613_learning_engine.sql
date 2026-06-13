-- Learning Engine — spaced-repetition Review + per-topic Mastery + Progress.
-- Pedagogy: wrong answers never lose progress beyond a mastery dip; the stored
-- explanation is always surfaced; predicted band is an encouraging RANGE.
--
-- Tables: question_attempts (raw log), review_cards (SM-2 scheduler),
-- topic_mastery (rolling per-topic level). RLS read-own; all writes go through
-- SECURITY DEFINER RPCs so clients can't forge another user's progress.

create table if not exists public.question_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id),
  question_id text not null,
  subject     text not null,
  topic       text,
  correct     boolean not null,
  confidence  smallint,
  created_at  timestamptz not null default now()
);
create index if not exists question_attempts_user_idx
  on public.question_attempts (user_id, created_at);

create table if not exists public.review_cards (
  user_id          uuid not null,
  question_id      text not null,
  subject          text,
  topic            text,
  ease             real not null default 2.5,
  interval_days    int  not null default 0,
  due_at           date not null default current_date,
  reps             int  not null default 0,
  lapses           int  not null default 0,
  last_reviewed_at timestamptz,
  primary key (user_id, question_id)
);
create index if not exists review_cards_due_idx
  on public.review_cards (user_id, due_at);

create table if not exists public.topic_mastery (
  user_id    uuid not null,
  subject    text not null,
  topic      text not null,
  level      smallint not null default 0,  -- 0 New, 1 Familiar, 2 Proficient, 3 Mastered
  points     int not null default 0,
  attempts   int not null default 0,
  correct    int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject, topic)
);

-- RLS: read-own only. Writes are blocked at table level (no write policies);
-- SECURITY DEFINER functions below bypass RLS to perform inserts/updates.
alter table public.question_attempts enable row level security;
alter table public.review_cards      enable row level security;
alter table public.topic_mastery     enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='question_attempts' and policyname='question_attempts_read_own')
    then create policy question_attempts_read_own on public.question_attempts
      for select to authenticated using (user_id = auth.uid()); end if;
  if not exists (select 1 from pg_policies where tablename='review_cards' and policyname='review_cards_read_own')
    then create policy review_cards_read_own on public.review_cards
      for select to authenticated using (user_id = auth.uid()); end if;
  if not exists (select 1 from pg_policies where tablename='topic_mastery' and policyname='topic_mastery_read_own')
    then create policy topic_mastery_read_own on public.topic_mastery
      for select to authenticated using (user_id = auth.uid()); end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helper: recompute a topic's mastery level from its rolling accuracy + points.
-- Downgradeable: a slump in accuracy or a points drop pulls the level back down.
--   level 3 Mastered:   points>=120 AND acc>=0.85
--   level 2 Proficient:  points>= 70 AND acc>=0.70
--   level 1 Familiar:    points>= 25 AND acc>=0.50
--   level 0 New:         otherwise
-- Accuracy only "counts" after a few attempts so one bad early answer can't
-- trap a topic at New.
-- ---------------------------------------------------------------------------
create or replace function public._lvl_from(p_points int, p_attempts int, p_correct int)
returns smallint language sql immutable as $$
  select case
    when p_attempts < 3 then
      -- early days: drive purely off points so progress feels responsive
      (case when p_points >= 70 then 2 when p_points >= 25 then 1 else 0 end)::smallint
    else (case
      when p_points >= 120 and p_correct::real / p_attempts >= 0.85 then 3
      when p_points >=  70 and p_correct::real / p_attempts >= 0.70 then 2
      when p_points >=  25 and p_correct::real / p_attempts >= 0.50 then 1
      else 0
    end)::smallint
  end;
$$;

-- ---------------------------------------------------------------------------
-- record_attempt — called from the quiz answer flow on EVERY answer.
-- Logs the attempt, upserts rolling topic_mastery, and (when the answer was
-- wrong or low-confidence) schedules a review card due today.
-- ---------------------------------------------------------------------------
create or replace function public.record_attempt(
  p_question_id text,
  p_subject     text,
  p_topic       text,
  p_correct     boolean,
  p_confidence  smallint default null
)
returns table(topic text, level smallint, points int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_topic  text := coalesce(nullif(trim(p_topic), ''), 'General');
  v_points int;
  v_att    int;
  v_cor    int;
  v_lvl    smallint;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  insert into public.question_attempts(user_id, question_id, subject, topic, correct, confidence)
  values (v_uid, p_question_id, p_subject, v_topic, p_correct, p_confidence);

  -- Upsert rolling mastery. Right: +10 points. Wrong: -7 points, floored at 0
  -- (never below zero — a wrong answer dips, it doesn't erase).
  insert into public.topic_mastery(user_id, subject, topic, attempts, correct, points, level, updated_at)
  values (v_uid, p_subject, v_topic, 1, (case when p_correct then 1 else 0 end),
          greatest(0, (case when p_correct then 10 else -7 end)), 0, now())
  on conflict (user_id, subject, topic) do update set
    attempts   = public.topic_mastery.attempts + 1,
    correct    = public.topic_mastery.correct + (case when p_correct then 1 else 0 end),
    points     = greatest(0, public.topic_mastery.points + (case when p_correct then 10 else -7 end)),
    updated_at = now()
  returning topic_mastery.points, topic_mastery.attempts, topic_mastery.correct
    into v_points, v_att, v_cor;

  v_lvl := public._lvl_from(v_points, v_att, v_cor);
  update public.topic_mastery tm set level = v_lvl
    where tm.user_id = v_uid and tm.subject = p_subject and tm.topic = v_topic;

  -- Schedule a review when the player got it wrong OR was unsure (confidence<=1).
  -- Resets interval to 0 and makes it due today; ease is left untouched here
  -- (ease only moves on an explicit self-grade in grade_review).
  if (p_correct is not true) or (p_confidence is not null and p_confidence <= 1) then
    insert into public.review_cards(user_id, question_id, subject, topic, interval_days, due_at)
    values (v_uid, p_question_id, p_subject, v_topic, 0, current_date)
    on conflict (user_id, question_id) do update set
      interval_days = 0,
      due_at        = current_date,
      subject       = excluded.subject,
      topic         = excluded.topic;
  end if;

  return query select v_topic, v_lvl, v_points;
end $$;

-- ---------------------------------------------------------------------------
-- get_due_reviews — due cards joined to their question, oldest-due first.
-- ---------------------------------------------------------------------------
create or replace function public.get_due_reviews(p_limit int default 15)
returns table(
  id text, subject text, topic text, stem text,
  options jsonb, correct_index smallint, explanation text,
  due_at date, interval_days int
)
language sql security definer set search_path = public as $$
  select q.id, q.subject, rc.topic, q.stem, q.options, q.correct_index, q.explanation,
         rc.due_at, rc.interval_days
  from public.review_cards rc
  join public.questions q on q.id = rc.question_id
  where rc.user_id = auth.uid()
    and rc.due_at <= current_date
  order by rc.due_at asc, rc.interval_days asc
  limit greatest(1, p_limit);
$$;

-- ---------------------------------------------------------------------------
-- grade_review — SM-2 update on the caller's card for a self-grade.
--   0 Again -> interval 1, lapses+1, ease-0.2 (floor 1.3)
--   1 Hard  -> interval*1.2, ease-0.15
--   2 Good  -> interval*ease
--   3 Easy  -> interval*ease*1.3, ease+0.15
-- New interval >= 1, plus +/-12% fuzz; reps+1; due_at = today + interval.
-- ---------------------------------------------------------------------------
create or replace function public.grade_review(p_question_id text, p_grade smallint)
returns table(due_at date, interval_days int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_card   public.review_cards;
  v_ease   real;
  v_int    real;
  v_fuzz   real;
  v_final  int;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select * into v_card from public.review_cards
   where user_id = v_uid and question_id = p_question_id;
  if not found then raise exception 'No review card for that question'; end if;

  v_ease := v_card.ease;
  v_int  := greatest(1, v_card.interval_days);  -- treat brand-new (0) as 1 for scaling

  if p_grade <= 0 then
    v_ease := greatest(1.3, v_ease - 0.2);
    v_int  := 1;
  elsif p_grade = 1 then
    v_ease := greatest(1.3, v_ease - 0.15);
    v_int  := v_int * 1.2;
  elsif p_grade = 2 then
    v_int  := v_int * v_ease;
  else
    v_ease := v_ease + 0.15;
    v_int  := v_int * v_ease * 1.3;
  end if;

  -- +/-12% fuzz so reviews don't all bunch on the same day.
  v_fuzz := 1 + ((random() * 0.24) - 0.12);
  v_final := greatest(1, round(v_int * v_fuzz)::int);

  update public.review_cards set
    ease             = v_ease,
    interval_days    = v_final,
    due_at           = current_date + v_final,
    reps             = reps + 1,
    lapses           = lapses + (case when p_grade <= 0 then 1 else 0 end),
    last_reviewed_at = now()
  where user_id = v_uid and question_id = p_question_id;

  return query select (current_date + v_final)::date, v_final;
end $$;

-- ---------------------------------------------------------------------------
-- get_progress — one row per subject the user has attempts in, plus 'overall'.
-- mastery_pct is a 0..100 weighted average of topic levels (0..3 -> 0..100).
-- band_low / band_high map pct to an encouraging band RANGE (low conservative,
-- high one band up), clamped 1..6.
-- ---------------------------------------------------------------------------
create or replace function public.get_progress()
returns table(
  subject text, attempts int, mastery_pct int, band_low int, band_high int
)
language sql security definer set search_path = public as $$
  with per_subject as (
    select tm.subject,
           coalesce(sum(tm.attempts), 0)::int as attempts,
           -- average level (0..3) over topics -> 0..100
           round(avg(tm.level) / 3.0 * 100)::int as pct
    from public.topic_mastery tm
    where tm.user_id = auth.uid()
    group by tm.subject
  ),
  rows as (
    select subject, attempts, pct from per_subject
    union all
    select 'overall',
           coalesce(sum(attempts), 0)::int,
           coalesce(round(avg(pct))::int, 0)
    from per_subject
  )
  select r.subject, r.attempts, r.pct,
         -- conservative low band, +1 high band, clamped 1..6
         least(6, greatest(1, 1 + floor(r.pct / 20.0)::int))                 as band_low,
         least(6, greatest(1, 1 + floor(r.pct / 20.0)::int + 1))             as band_high
  from rows r
  -- keep 'overall' last; subjects alphabetical
  order by (r.subject = 'overall') asc, r.subject asc;
$$;

-- ---------------------------------------------------------------------------
-- get_weak_topics — lowest-mastery / most-overdue topics to focus on.
-- ---------------------------------------------------------------------------
create or replace function public.get_weak_topics(p_subject text default null, p_limit int default 6)
returns table(
  subject text, topic text, level smallint, pct int, due_count int
)
language sql security definer set search_path = public as $$
  select tm.subject, tm.topic, tm.level,
         round(tm.level / 3.0 * 100)::int as pct,
         coalesce((
           select count(*)::int from public.review_cards rc
           where rc.user_id = tm.user_id
             and rc.subject = tm.subject and rc.topic = tm.topic
             and rc.due_at <= current_date
         ), 0) as due_count
  from public.topic_mastery tm
  where tm.user_id = auth.uid()
    and (p_subject is null or tm.subject = p_subject)
  order by tm.level asc,
           due_count desc,
           tm.points asc
  limit greatest(1, p_limit);
$$;

grant execute on function public.record_attempt(text, text, text, boolean, smallint) to authenticated, anon;
grant execute on function public.get_due_reviews(int)                                to authenticated, anon;
grant execute on function public.grade_review(text, smallint)                        to authenticated, anon;
grant execute on function public.get_progress()                                      to authenticated, anon;
grant execute on function public.get_weak_topics(text, int)                          to authenticated, anon;
