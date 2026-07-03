create or replace function public.award_xp(p_reason_key text, p_amount integer, p_kind text default 'xp'::text, p_subject text default null::text)
 returns table(total_xp bigint, coins bigint)
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_rows int := 0;
  v_old bigint;
  v_max int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_amount < 0 then raise exception 'amount must be >= 0'; end if;

  -- reason-aware anti-inflation cap: per-action awards <=200; the one-time
  -- localStorage->server migration ('migration-%') may move a whole balance
  -- (bounded to 50000, still dedup'd to once per user via reason_key).
  v_max := case when p_reason_key like 'migration-%' then 50000 else 200 end;
  if p_amount > v_max then
    raise exception 'amount % exceeds cap % for reason %', p_amount, v_max, p_reason_key;
  end if;

  insert into xp_events (user_id, reason_key, amount, kind, subject)
  values (v_uid, p_reason_key, p_amount, coalesce(p_kind,'xp'), p_subject)
  on conflict (user_id, reason_key) do nothing;
  get diagnostics v_rows = row_count;

  insert into user_stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  if v_rows > 0 then
    if coalesce(p_kind,'xp') = 'xp' then
      select us.total_xp into v_old from user_stats us where us.user_id = v_uid;
      update user_stats us set
        total_xp = us.total_xp + p_amount,
        coins = us.coins + (floor((v_old + p_amount)::numeric/5) - floor(v_old::numeric/5))::bigint,
        updated_at = now()
      where us.user_id = v_uid;
    else
      update user_stats us set coins = us.coins + p_amount, updated_at = now()
      where us.user_id = v_uid;
    end if;
  end if;

  return query select us.total_xp, us.coins from user_stats us where us.user_id = v_uid;
end $function$;
revoke all on function public.award_xp(text,int,text,text) from public;
grant execute on function public.award_xp(text,int,text,text) to authenticated;