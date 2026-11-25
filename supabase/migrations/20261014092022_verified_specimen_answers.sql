-- Server-owned answer key and correct-answer evidence. No production deployment in this PR.
begin;
create schema if not exists legends_private;
revoke all on schema legends_private from public, anon, authenticated;
create table legends_private.specimen_questions (
  id text primary key,
  card_id text not null unique references public.card_catalog(id),
  correct_index int not null,
  option_count int not null check (option_count >= 2),
  check (correct_index >= 0 and correct_index < option_count)
);
create table legends_private.specimen_correct_answers (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null references legends_private.specimen_questions(id),
  answered_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
alter table legends_private.specimen_questions enable row level security;
alter table legends_private.specimen_correct_answers enable row level security;
revoke all on legends_private.specimen_questions, legends_private.specimen_correct_answers from public, anon, authenticated;
insert into legends_private.specimen_questions(id, card_id, correct_index, option_count) values
  ('spec-soda-sealed', 'spec-soda-sealed', 1, 4),
  ('spec-soda-open', 'spec-soda-open', 0, 4),
  ('spec-campfire-ash', 'spec-campfire-ash', 0, 3),
  ('spec-iodine-flask', 'spec-iodine-flask', 1, 3),
  ('spec-evaporating-beaker', 'spec-evaporating-beaker', 2, 3),
  ('spec-salt-jar', 'spec-salt-jar', 1, 3),
  ('spec-hot-coffee', 'spec-hot-coffee', 2, 3),
  ('spec-burned-magnesium', 'spec-burned-magnesium', 0, 3),
  ('spec-tr4', 'spec-cavendish', 0, 4),
  ('spec-strawberry-runner', 'spec-strawberry-runner', 1, 4),
  ('spec-strawberry-flower', 'spec-strawberry-flower', 2, 4),
  ('spec-varied-seedlings', 'spec-varied-seedlings', 2, 4),
  ('spec-stable-pond', 'spec-stable-pond', 0, 3),
  ('spec-island-plant', 'spec-island-plant', 1, 3),
  ('spec-warming-field', 'spec-warming-field', 2, 3),
  ('spec-rhizopus', 'spec-rhizopus', 1, 4),
  ('spec-fresh-bread', 'spec-fresh-bread', 0, 4);

-- Keep the old signature safe on installations where it already exists. Neither
-- client-supplied correctness nor the existing record_attempt RPC is evidence.
create or replace function public.claim_specimen_card(p_card_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_new int;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if not exists (
    select 1 from legends_private.specimen_correct_answers a
    join legends_private.specimen_questions q on q.id = a.question_id
    join public.card_catalog c on c.id = q.card_id and c.source = 'specimen'
    where a.user_id = v_uid and q.card_id = p_card_id
  ) then raise exception 'verified correct answer required'; end if;
  insert into public.user_cards(user_id, card_id) values (v_uid, p_card_id)
    on conflict (user_id, card_id) do nothing;
  get diagnostics v_new = row_count;
  return v_new > 0;
end $$;
revoke all on function public.claim_specimen_card(text) from public, anon;
grant execute on function public.claim_specimen_card(text) to authenticated;

-- Grading, evidence and award are one transaction; repeated correct submissions
-- never increment card counts, award coins, or issue duplicate refunds.
create or replace function public.submit_specimen_answer(p_question_id text, p_answer_index int)
returns table(correct boolean, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_q legends_private.specimen_questions;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select * into v_q from legends_private.specimen_questions where id = p_question_id;
  if not found then raise exception 'unknown specimen question'; end if;
  if p_answer_index is null or p_answer_index < 0 or p_answer_index >= v_q.option_count then
    raise exception 'invalid answer index';
  end if;
  if p_answer_index <> v_q.correct_index then
    return query select false, false;
    return;
  end if;
  insert into legends_private.specimen_correct_answers(user_id, question_id)
    values (v_uid, p_question_id) on conflict (user_id, question_id) do nothing;
  return query select true, public.claim_specimen_card(v_q.card_id);
end $$;
revoke all on function public.submit_specimen_answer(text, int) from public, anon;
grant execute on function public.submit_specimen_answer(text, int) to authenticated;
commit;
