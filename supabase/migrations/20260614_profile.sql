-- Profile hub — a single aggregate read that powers the /profile identity screen.
-- Rolls up name/avatar, XP/coins, streak, league division, collection & achievement
-- progress, lifetime question accuracy, and duel record into one row.

create or replace function public.get_profile_summary()
returns table(
  name          text,
  avatar_style  text,
  avatar_seed   text,
  total_xp      bigint,
  coins         bigint,
  streak        int,
  freezes       int,
  division      int,
  cards_owned   int,
  cards_total   int,
  ach_unlocked  int,
  ach_total     int,
  answered      int,
  correct       int,
  duels_won     int,
  duels_lost    int
)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  return query
  select
    coalesce(nullif(p.display_name,''),
             case when p.codename is not null and p.handle_tag is not null
                  then p.codename || '#' || lpad(p.handle_tag::text,4,'0') end,
             nullif(p.name,''), 'Legend')                                          as name,
    p.avatar_style,
    p.avatar_seed,
    coalesce(s.total_xp, 0)::bigint                                                as total_xp,
    coalesce(s.coins, 0)::bigint                                                   as coins,
    coalesce(st.current, 0)::int                                                   as streak,
    coalesce(st.freezes, 0)::int                                                   as freezes,
    coalesce((select m.division from public.league_members m where m.user_id = v_uid), 0)::int as division,
    (select count(distinct uc.card_id) from public.user_cards uc where uc.user_id = v_uid)::int as cards_owned,
    (select count(*) from public.card_catalog)::int                                as cards_total,
    (select count(*) from public.user_achievements ua where ua.user_id = v_uid)::int as ach_unlocked,
    (select count(*) from public.achievement_catalog)::int                         as ach_total,
    (select count(*) from public.question_attempts qa where qa.user_id = v_uid)::int as answered,
    (select count(*) from public.question_attempts qa where qa.user_id = v_uid and qa.correct)::int as correct,
    coalesce((select sum(de.wins) from public.duel_elo de where de.user_id = v_uid), 0)::int   as duels_won,
    coalesce((select sum(de.losses) from public.duel_elo de where de.user_id = v_uid), 0)::int as duels_lost
  from (select v_uid as user_id) base
  left join public.user_profiles p on p.user_id = base.user_id
  left join public.user_stats    s on s.user_id = base.user_id
  left join public.streaks       st on st.user_id = base.user_id;
end $$;

grant execute on function public.get_profile_summary() to anon, authenticated;
