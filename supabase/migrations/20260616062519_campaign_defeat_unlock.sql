-- Battle v3: the fight is client-side (HP resets each game, doesn't persist).
-- Only the UNLOCK persists. This advances the stage + awards the reward on a
-- client-confirmed defeat, mirroring campaign_attack's defeat branch.
CREATE OR REPLACE FUNCTION public.campaign_defeat(p_subject text)
RETURNS TABLE(stage integer, max_hp integer, reward integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_stage int; v_reward int;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  insert into public.user_campaign (user_id, subject) values (v_uid, p_subject)
    on conflict (user_id, subject) do nothing;
  select c.stage into v_stage from public.user_campaign c
    where c.user_id = v_uid and c.subject = p_subject for update;
  v_reward := 50 + v_stage * 25;
  perform public.credit_coins(v_reward, 'campaign', jsonb_build_object('subject', p_subject));
  v_stage := v_stage + 1;
  update public.user_campaign c
    set stage = v_stage, max_hp = 100 * v_stage, hp = 100 * v_stage,
        defeated_count = c.defeated_count + 1, updated_at = now()
    where c.user_id = v_uid and c.subject = p_subject;
  return query select v_stage, 100 * v_stage, v_reward;
end $function$;

GRANT EXECUTE ON FUNCTION public.campaign_defeat(text) TO authenticated;