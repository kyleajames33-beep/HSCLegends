-- Achievements — long-term progression badges computed from existing activity.
-- Unlocks persist (once earned, stays earned even if a stat later drops, e.g. streak).
-- get_achievements() computes live progress AND records new unlocks on read.

create table if not exists public.achievement_catalog (
  id          text primary key,
  name        text not null,
  emoji       text not null,
  description text not null,
  metric      text not null,   -- answered | correct | xp | streak | duels_won | cards | mastered
  threshold   int  not null,
  sort        int  not null default 0
);

create table if not exists public.user_achievements (
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievement_catalog(id),
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.achievement_catalog enable row level security;
alter table public.user_achievements   enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='achievement_catalog' and policyname='achievement_catalog_read')
    then create policy achievement_catalog_read on public.achievement_catalog for select to anon, authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='user_achievements' and policyname='user_achievements_own')
    then create policy user_achievements_own on public.user_achievements for select to authenticated using (user_id = auth.uid()); end if;
end $$;

insert into public.achievement_catalog (id, name, emoji, description, metric, threshold, sort) values
  ('ans_100',     'Getting Started',  '🌱', 'Answer 100 questions.',        'answered',  100,  1),
  ('ans_1000',    'Grinder',          '⚙️', 'Answer 1,000 questions.',      'answered', 1000,  2),
  ('ans_5000',    'Machine',          '🤖', 'Answer 5,000 questions.',      'answered', 5000,  3),
  ('correct_500', 'Sharp Shooter',    '🎯', 'Get 500 correct answers.',     'correct',   500,  4),
  ('xp_1000',     'Rising Star',      '⭐', 'Earn 1,000 XP.',               'xp',       1000,  5),
  ('xp_10000',    'XP Olympian',      '🏆', 'Earn 10,000 XP.',              'xp',      10000,  6),
  ('streak_7',    'Week Warrior',     '🔥', 'Reach a 7-day streak.',        'streak',      7,  7),
  ('streak_30',   'Unstoppable',      '🌋', 'Reach a 30-day streak.',       'streak',     30,  8),
  ('duels_5',     'Duellist',         '⚔️', 'Win 5 Duels.',                 'duels_won',   5,  9),
  ('duels_25',    'Gladiator',        '🛡️', 'Win 25 Duels.',                'duels_won',  25, 10),
  ('cards_10',    'Collector',        '🃏', 'Collect 10 Legend Cards.',     'cards',      10, 11),
  ('cards_25',    'Curator',          '👑', 'Collect 25 Legend Cards.',     'cards',      25, 12),
  ('mastered_5',  'Topic Master',     '🧠', 'Master 5 topics.',             'mastered',    5, 13),
  ('mastered_20', 'Syllabus Slayer',  '📚', 'Master 20 topics.',            'mastered',   20, 14)
on conflict (id) do update set
  name=excluded.name, emoji=excluded.emoji, description=excluded.description,
  metric=excluded.metric, threshold=excluded.threshold, sort=excluded.sort;

create or replace function public.get_achievements()
returns table(id text, name text, emoji text, description text, progress int, threshold int, unlocked boolean, sort int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_answered int; v_correct int; v_xp bigint; v_streak int; v_duels int; v_cards int; v_mastered int;
  rec record; v_val bigint; v_unlocked boolean;
begin
  if v_uid is null then return; end if;
  select count(*) into v_answered from public.question_attempts where user_id = v_uid;
  select count(*) into v_correct  from public.question_attempts where user_id = v_uid and correct;
  select coalesce(total_xp,0) into v_xp from public.user_stats where user_id = v_uid;
  select coalesce(current,0)  into v_streak from public.streaks where user_id = v_uid;
  select coalesce(sum(wins),0) into v_duels from public.duel_elo where user_id = v_uid;
  select count(*) into v_cards from public.user_cards where user_id = v_uid;
  select count(*) into v_mastered from public.topic_mastery where user_id = v_uid and level >= 3;

  for rec in select * from public.achievement_catalog order by sort loop
    v_val := case rec.metric
      when 'answered'  then v_answered
      when 'correct'   then v_correct
      when 'xp'        then v_xp
      when 'streak'    then v_streak
      when 'duels_won' then v_duels
      when 'cards'     then v_cards
      when 'mastered'  then v_mastered
      else 0 end;
    v_unlocked := v_val >= rec.threshold
      or exists (select 1 from public.user_achievements ua where ua.user_id = v_uid and ua.achievement_id = rec.id);
    if v_val >= rec.threshold then
      insert into public.user_achievements(user_id, achievement_id) values (v_uid, rec.id)
        on conflict do nothing;
    end if;
    id := rec.id; name := rec.name; emoji := rec.emoji; description := rec.description;
    progress := least(v_val, rec.threshold)::int; threshold := rec.threshold;
    unlocked := v_unlocked; sort := rec.sort;
    return next;
  end loop;
end $$;

grant execute on function public.get_achievements() to authenticated, anon;
