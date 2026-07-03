-- Host/projector answer-count for the current live question. Read-only, additive.
create or replace function public.live_answer_count(p_session uuid, p_index smallint)
returns table(answered int, total int, correct int)
language sql stable security definer set search_path to 'public' as $$
  select
    (select count(*)::int from public.game_answers a where a.session_id = p_session and a.question_index = p_index),
    (select count(*)::int from public.game_players p where p.session_id = p_session),
    (select count(*)::int from public.game_answers a where a.session_id = p_session and a.question_index = p_index and a.is_correct);
$$;
grant execute on function public.live_answer_count(uuid, smallint) to anon, authenticated;