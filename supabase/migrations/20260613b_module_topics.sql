-- HSC Topic Map — group by syllabus MODULE (clean codes module-1 … module-10),
-- NOT by the ultra-granular `topic` micro-slugs. Read-only selector RPCs over
-- public.questions. All filter: not excluded + non-empty options jsonb array.
-- DO NOT modify the questions table here.

-- Usable predicate (inlined per query):
--   excluded is not true
--   and options is not null
--   and jsonb_typeof(options) = 'array'
--   and jsonb_array_length(options) > 0

-- Count of usable questions per syllabus module for a subject.
create or replace function public.get_module_counts(p_subject text)
returns table(module text, n int)
language sql stable security definer set search_path = public as $$
  select q.module, count(*)::int as n
  from public.questions q
  where q.subject = p_subject
    and q.module is not null
    and q.excluded is not true
    and q.options is not null
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) > 0
  group by q.module
  order by q.module;
$$;

-- Usable questions for one module. Prefer concise, random order, limited.
create or replace function public.get_module_questions(
  p_subject text,
  p_module  text,
  p_limit   int default 12
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
    and q.module = p_module
    and q.excluded is not true
    and q.options is not null
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) > 0
  order by (q.concise is true) desc, random()
  limit greatest(1, coalesce(p_limit, 12));
$$;

grant execute on function
  public.get_module_counts(text),
  public.get_module_questions(text, text, int)
  to anon, authenticated;
