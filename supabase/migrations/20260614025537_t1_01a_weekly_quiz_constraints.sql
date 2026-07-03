alter table public.weekly_quiz_attempts
  drop constraint if exists wqa_correct_range,
  drop constraint if exists wqa_total_bound,
  drop constraint if exists wqa_score_bound;

alter table public.weekly_quiz_attempts
  add constraint wqa_correct_range check (correct >= 0 and correct <= total),
  add constraint wqa_total_bound   check (total > 0 and total <= 25),
  -- calibrated to weekly-quiz.js: <=2600 points per correct answer, 0 for wrong
  add constraint wqa_score_bound   check (score >= 0 and score <= correct * 2600);