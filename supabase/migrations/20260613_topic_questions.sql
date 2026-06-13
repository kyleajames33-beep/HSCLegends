-- HSC Content modes — Topic Map (past-papers-by-topic) + Exam (Section I).
-- Read-only selector RPCs over the existing public.questions table.
-- All exclude `excluded is not true` and require a non-empty options array.
-- DO NOT modify the questions table here.

-- Helper predicate (inlined per query): usable = not excluded, has options.
--   excluded is not true
--   and options is not null
--   and jsonb_typeof(options) = 'array'
--   and jsonb_array_length(options) > 0

-- Count of usable questions per topic for a subject. Grouped by the primary
-- `topic` column (simple + index-friendly). Topics with 0 usable questions
-- simply don't appear; the UI greys those out.
create or replace function public.get_topic_counts(p_subject text)
returns table(topic text, n int)
language sql stable security definer set search_path = public as $$
  select q.topic, count(*)::int as n
  from public.questions q
  where q.subject = p_subject
    and q.topic is not null
    and q.excluded is not true
    and q.options is not null
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) > 0
  group by q.topic
  order by n desc, q.topic;
$$;

-- Usable questions for one topic (matching the primary `topic` OR the
-- `topics[]` array). Optional year filter. Prefer concise questions, then
-- random order, limited.
create or replace function public.get_topic_questions(
  p_subject text,
  p_topic   text,
  p_year    smallint default null,
  p_limit   int default 12
)
returns table(
  id text, stem text, options jsonb, correct_index smallint,
  explanation text, year smallint, difficulty smallint
)
language sql stable security definer set search_path = public as $$
  select q.id, q.stem, q.options, q.correct_index,
         q.explanation, q.year, q.difficulty
  from public.questions q
  where q.subject = p_subject
    and (q.topic = p_topic or p_topic = any(q.topics))
    and (p_year is null or q.year = p_year)
    and q.excluded is not true
    and q.options is not null
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) > 0
  order by (q.concise is true) desc, random()
  limit greatest(1, coalesce(p_limit, 12));
$$;

-- A balanced-ish random Section-I set for subject + year. Random usable
-- questions, preferring concise ones. Includes topic for review grouping.
create or replace function public.get_exam_questions(
  p_subject text,
  p_year    smallint default 12,
  p_limit   int default 20
)
returns table(
  id text, stem text, options jsonb, correct_index smallint,
  explanation text, year smallint, difficulty smallint, topic text
)
language sql stable security definer set search_path = public as $$
  select q.id, q.stem, q.options, q.correct_index,
         q.explanation, q.year, q.difficulty, q.topic
  from public.questions q
  where q.subject = p_subject
    and (p_year is null or q.year = p_year)
    and q.excluded is not true
    and q.options is not null
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) > 0
  order by (q.concise is true) desc, random()
  limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function
  public.get_topic_counts(text),
  public.get_topic_questions(text, text, smallint, int),
  public.get_exam_questions(text, smallint, int)
  to anon, authenticated;
