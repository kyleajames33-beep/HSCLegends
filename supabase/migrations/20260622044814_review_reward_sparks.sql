drop function if exists public.grade_review(text, smallint);

create or replace function public.grade_review(p_question_id text, p_grade smallint)
returns table(due_at date, interval_days integer, awarded integer)
language plpgsql security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); v_card public.review_cards;
  v_ease real; v_int real; v_fuzz real; v_final int; v_award int := 0;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into v_card from public.review_cards where user_id = v_uid and question_id = p_question_id;
  if not found then raise exception 'No review card for that question'; end if;
  -- Reward only genuinely-due reviews. Farm-proof: grading pushes due_at into the
  -- future, so an immediate re-grade reads due_at > today and earns nothing.
  if v_card.due_at <= current_date then v_award := 3; end if;
  v_ease := v_card.ease; v_int := greatest(1, v_card.interval_days);
  if p_grade <= 0 then v_ease := greatest(1.3, v_ease - 0.2); v_int := 1;
  elsif p_grade = 1 then v_ease := greatest(1.3, v_ease - 0.15); v_int := v_int * 1.2;
  elsif p_grade = 2 then v_int := v_int * v_ease;
  else v_ease := v_ease + 0.15; v_int := v_int * v_ease * 1.3; end if;
  v_fuzz := 1 + ((random() * 0.24) - 0.12);
  v_final := greatest(1, round(v_int * v_fuzz)::int);
  update public.review_cards set
    ease = v_ease, interval_days = v_final, due_at = current_date + v_final,
    reps = reps + 1, lapses = lapses + (case when p_grade <= 0 then 1 else 0 end), last_reviewed_at = now()
  where user_id = v_uid and question_id = p_question_id;
  if v_award > 0 then
    insert into public.user_stats(user_id, coins) values (v_uid, v_award)
    on conflict (user_id) do update set coins = public.user_stats.coins + v_award, updated_at = now();
  end if;
  return query select (current_date + v_final)::date, v_final, v_award;
end $function$;

grant execute on function public.grade_review(text, smallint) to authenticated;