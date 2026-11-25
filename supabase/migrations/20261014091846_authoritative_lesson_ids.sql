-- Copied from live selector definitions on 2026-10-14. Only lesson_id is added.
-- Return-table changes require drop/recreate; restore the existing API grants.
begin;

drop function public.get_due_reviews(int);

create or replace function public.get_due_reviews(p_limit int default 15)
returns table(
  id text, subject text, topic text, stem text,
  options jsonb, correct_index smallint, explanation text,
  due_at date, interval_days int, lesson_id text
)
language sql security definer set search_path = public as $$
  select q.id, q.subject, rc.topic, q.stem, q.options, q.correct_index, q.explanation,
         rc.due_at, rc.interval_days, q.lesson_id
  from public.review_cards rc
  join public.questions q on q.id = rc.question_id
  where rc.user_id = auth.uid()
    and rc.due_at <= current_date
  order by rc.due_at asc, rc.interval_days asc
  limit greatest(1, p_limit);
$$;

revoke all on function public.get_due_reviews(int) from public;
grant execute on function public.get_due_reviews(int) to authenticated, service_role;

drop function public.get_exam_questions(text, smallint, int);

create or replace function public.get_exam_questions(
  p_subject text,
  p_year    smallint default 12,
  p_limit   int default 20
)
returns table(
  id text, stem text, options jsonb, correct_index smallint,
  explanation text, year smallint, difficulty smallint, topic text, lesson_id text
)
language sql stable security definer set search_path = public as $$
  select q.id, q.stem, q.options, q.correct_index,
         q.explanation, q.year, q.difficulty, q.topic, q.lesson_id
  from public.questions q
  where q.subject = p_subject
    and (p_year is null or q.year = p_year)
    and q.excluded is not true
    and q.options is not null
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) > 0
  order by q.verified desc, (q.concise is true) desc, random()
  limit greatest(1, coalesce(p_limit, 20));
$$;

revoke all on function public.get_exam_questions(text, smallint, int) from public;
grant execute on function public.get_exam_questions(text, smallint, int) to anon, authenticated, service_role;

drop function public.get_module_questions(text, text, int);

create or replace function public.get_module_questions(
  p_subject text,
  p_module  text,
  p_limit   int default 12
)
returns table(
  id text, stem text, options jsonb, correct_index smallint,
  explanation text, year smallint, difficulty smallint, topic text, lesson_id text
)
language sql stable security definer set search_path = public as $$
  select q.id, q.stem, q.options, q.correct_index,
         q.explanation, q.year, q.difficulty, q.topic, q.lesson_id
  from public.questions q
  where q.subject = p_subject
    and q.module = p_module
    and q.excluded is not true
    and q.options is not null
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) > 0
  order by q.verified desc, (q.concise is true) desc, random()
  limit greatest(1, coalesce(p_limit, 12));
$$;

revoke all on function public.get_module_questions(text, text, int) from public;
grant execute on function public.get_module_questions(text, text, int) to anon, authenticated, service_role;

commit;
