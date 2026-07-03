-- Smart notification targeting (no pg_cron on this project; an edge function +
-- external schedule drives it). streak_nudge_targets() returns at-risk users
-- (active streak, haven't played today AEST, not already nudged today) with their
-- push subscriptions. SECURITY DEFINER + service_role-only (returns PII).

create table if not exists public.notif_log (
  user_id uuid not null,
  kind    text not null,
  sent_on date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, sent_on)
);
alter table public.notif_log enable row level security;  -- no policies: service-role only

create or replace function public.streak_nudge_targets()
returns table(user_id uuid, endpoint text, p256dh text, auth text, streak int)
language sql security definer set search_path = public as $$
  select st.user_id, ps.endpoint, ps.p256dh, ps.auth, st.current::int
  from public.streaks st
  join public.push_subscriptions ps on ps.user_id = st.user_id
  where st.current >= 1
    and st.last_date < (timezone('Australia/Sydney', now()))::date
    and not exists (
      select 1 from public.notif_log nl
      where nl.user_id = st.user_id and nl.kind = 'streak'
        and nl.sent_on = (timezone('Australia/Sydney', now()))::date
    );
$$;

-- Mark a user nudged today (called by the dispatcher after a successful send).
create or replace function public.mark_notif_sent(p_user uuid, p_kind text)
returns void language sql security definer set search_path = public as $$
  insert into public.notif_log(user_id, kind, sent_on)
  values (p_user, p_kind, (timezone('Australia/Sydney', now()))::date)
  on conflict do nothing;
$$;

revoke all on function public.streak_nudge_targets() from anon, authenticated;
revoke all on function public.mark_notif_sent(uuid, text) from anon, authenticated;
grant execute on function public.streak_nudge_targets() to service_role;
grant execute on function public.mark_notif_sent(uuid, text) to service_role;