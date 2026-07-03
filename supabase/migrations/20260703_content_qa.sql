-- Content QA pass (applied to the shared question bank). Conservative fixes only.
--  1) Strip leftover MCQ label prefixes from options ("A) foo" -> "foo") — a
--     rendering bug (the app already prepends A/B/C/D). Array order preserved so
--     correct_index stays valid. (~130 rows.)
--  2) Exclude byte-identical duplicate questions, keeping the earliest id in each
--     group — zero information loss. (53 rows.)
--  3) Add a `verified` trust flag = not excluded AND has a real explanation.
-- Structural audit was clean beforehand: 0 out-of-range correct_index, 0 empty
-- stems/options, all rows have module + topic.

update public.questions q
set options = (
  select jsonb_agg(regexp_replace(elem, '^[A-Ea-e][).:] ', '') order by ord)
  from jsonb_array_elements_text(q.options) with ordinality as t(elem, ord)
)
where q.excluded is not true
  and exists (select 1 from jsonb_array_elements_text(q.options) o where o ~ '^[A-Ea-e][).:] ');

with ranked as (
  select id, row_number() over (
    partition by subject, lower(trim(stem)), options::text, correct_index order by id
  ) rn
  from public.questions where excluded is not true
)
update public.questions q set excluded = true
from ranked r where q.id = r.id and r.rn > 1;

alter table public.questions add column if not exists verified boolean not null default false;
update public.questions
set verified = (excluded is not true
                and explanation is not null and length(trim(explanation)) >= 3);
create index if not exists questions_verified_idx on public.questions (subject, verified) where verified;
