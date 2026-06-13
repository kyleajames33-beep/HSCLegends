-- Legend Cards — earn-only collectible system (gacha with PUBLISHED odds).
-- Packs are bought with Sparks (coins). No real money anywhere. Dupes refund
-- partial Sparks. All odds are disclosed in-app. Writes go through SECURITY
-- DEFINER funcs; tables are read-only via RLS.

create table if not exists public.card_catalog (
  id       text primary key,
  name     text not null,
  subject  text,                         -- null = subject-agnostic "Legend" card
  rarity   text not null check (rarity in ('common','rare','epic','legendary','mythic')),
  art_kind text not null check (art_kind in ('boss','emoji','dicebear')),
  art_ref  text not null,                -- subject (boss → /bosses/<ref>/idle.png) | emoji | dicebear seed
  flavor   text not null default '',
  sort     int  not null default 0
);

create table if not exists public.user_cards (
  user_id  uuid not null references auth.users(id) on delete cascade,
  card_id  text not null references public.card_catalog(id),
  count    int  not null default 1,
  first_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index if not exists user_cards_user_idx on public.user_cards (user_id);

alter table public.card_catalog enable row level security;
alter table public.user_cards   enable row level security;
do $$ begin
  -- Public read on the catalog (odds/cards are not secret).
  if not exists (select 1 from pg_policies where tablename='card_catalog' and policyname='card_catalog_read')
    then create policy card_catalog_read on public.card_catalog for select to anon, authenticated using (true); end if;
  -- A user can only read their own owned cards. No insert/update/delete policies → writes only via SECURITY DEFINER funcs.
  if not exists (select 1 from pg_policies where tablename='user_cards' and policyname='user_cards_own')
    then create policy user_cards_own on public.user_cards for select to authenticated using (user_id = auth.uid()); end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed catalog (~36 cards). Upsert so re-running is safe.
-- ---------------------------------------------------------------------------
insert into public.card_catalog (id, name, subject, rarity, art_kind, art_ref, flavor, sort) values
  -- Biology
  ('bio-cell',      'Lonely Cell',          'biology', 'common',    'emoji',    '🦠', 'Where it all begins — one tiny powerhouse.', 1),
  ('bio-dna',       'Double Helix',         'biology', 'rare',      'emoji',    '🧬', 'Four letters, infinite stories.', 2),
  ('bio-leaf',      'Photosynth Prodigy',   'biology', 'epic',      'emoji',    '🌿', 'Turns sunlight into homework fuel.', 3),
  ('bio-microscope','Field Biologist',      'biology', 'legendary', 'dicebear', 'bio-legend', 'Has named three species and lost two.', 4),
  ('bio-boss',      'Apex of Biology',      'biology', 'mythic',    'boss',     'biology', 'The final form. It has notes on you.', 5),
  -- Chemistry
  ('chem-flask',    'Bubbling Beaker',      'chemistry', 'common',    'emoji',    '⚗️', 'Probably fine. Probably.', 1),
  ('chem-atom',     'Orbital Ace',          'chemistry', 'rare',      'emoji',    '⚛️', 'Knows exactly where its electrons are. Mostly.', 2),
  ('chem-fire',     'Exothermic Legend',    'chemistry', 'epic',      'emoji',    '🔥', 'Releases energy and vibes.', 3),
  ('chem-scientist','Lab Veteran',          'chemistry', 'legendary', 'dicebear', 'chem-legend', 'Goggles on, never burned the bench. Today.', 4),
  ('chem-boss',     'Apex of Chemistry',    'chemistry', 'mythic',    'boss',     'chemistry', 'Balances every equation, including yours.', 5),
  -- Physics
  ('phys-tele',     'Backyard Stargazer',   'physics', 'common',    'emoji',    '🔭', 'Looks up so you do not have to.', 1),
  ('phys-magnet',   'Field Lines',          'physics', 'rare',      'emoji',    '🧲', 'Attractive. Also repulsive. Depends.', 2),
  ('phys-bolt',     'Voltage Virtuoso',     'physics', 'epic',      'emoji',    '⚡', 'Resistance is futile (and measured in ohms).', 3),
  ('phys-rocket',   'Escape Velocity',      'physics', 'legendary', 'dicebear', 'phys-legend', 'Already left the atmosphere of this exam.', 4),
  ('phys-boss',     'Apex of Physics',      'physics', 'mythic',    'boss',     'physics', 'Bends spacetime and the marking scheme.', 5),
  -- Maths Standard
  ('mstd-ruler',    'Steady Surveyor',      'maths-standard', 'common',    'emoji',    '📐', 'Right angles, right answers.', 1),
  ('mstd-chart',    'Data Whisperer',       'maths-standard', 'rare',      'emoji',    '📊', 'Sees the trend before the trend exists.', 2),
  ('mstd-money',    'Compound Champion',    'maths-standard', 'epic',      'emoji',    '💰', 'Interest builds. So does this legend.', 3),
  ('mstd-boss',     'Apex of Maths Std',    'maths-standard', 'legendary', 'boss',     'maths-standard', 'Every formula, mastered. The sheet fears it.', 4),
  -- Maths Advanced
  ('madv-sigma',    'Sum of All Things',    'maths-advanced', 'common',    'emoji',    '➗', 'Divides problems, multiplies wins.', 1),
  ('madv-curve',    'Calculus Climber',     'maths-advanced', 'rare',      'emoji',    '📈', 'Finds the slope of any situation.', 2),
  ('madv-pi',       'Irrational Hero',      'maths-advanced', 'epic',      'emoji',    '🥧', 'Never repeats, never ends, never wrong.', 3),
  ('madv-boss',     'Apex of Maths Adv',    'maths-advanced', 'legendary', 'boss',     'maths-advanced', 'Differentiates between you and greatness.', 4),
  -- Maths Ext 1
  ('mex1-inf',      'Infinity Initiate',    'maths-ext1', 'common',    'emoji',    '♾️', 'Limits? It does not know them.', 1),
  ('mex1-vector',   'Vector Vanguard',      'maths-ext1', 'rare',      'emoji',    '🧭', 'Magnitude and direction, always.', 2),
  ('mex1-proof',    'Proof Phenom',         'maths-ext1', 'epic',      'emoji',    '🪄', 'QED, with a flourish.', 3),
  ('mex1-boss',     'Apex of Ext 1',        'maths-ext1', 'legendary', 'boss',     'maths-ext1', 'Induction complete. The base case bows.', 4),
  -- Subject-agnostic "Legend" cards (famous-scientist themed)
  ('leg-curie',     'Marie the Radiant',    null, 'epic',      'emoji',    '☢️', 'Glowed with discovery (and a little polonium).', 1),
  ('leg-newton',    'Sir Isaac of Apples',  null, 'epic',      'emoji',    '🍎', 'What goes up must hand in homework.', 2),
  ('leg-einstein',  'Relativity Royalty',   null, 'legendary', 'emoji',    '🧑‍🔬', 'Time flies when you bend it.', 3),
  ('leg-darwin',    'The Naturalist',       null, 'rare',      'emoji',    '🐢', 'Adapted, survived, topped the cohort.', 4),
  ('leg-ada',       'Countess of Code',     null, 'rare',      'emoji',    '👩‍🔬', 'Wrote the first algorithm, aced the exam.', 5),
  ('leg-tesla',     'Coil Conjurer',        null, 'epic',      'emoji',    '🌩️', 'Wireless before it was cool.', 6),
  ('leg-hawking',   'Cosmic Sage',          null, 'legendary', 'emoji',    '🕳️', 'Stared into the void; the void blinked.', 7),
  ('leg-goodall',   'Primate Patron',       null, 'rare',      'emoji',    '🦍', 'Patience, observation, and very good notes.', 8),
  ('leg-legend',    'The HSC Legend',       null, 'mythic',    'emoji',    '👑', 'You. After the exam. Crowned.', 9)
on conflict (id) do update set
  name=excluded.name, subject=excluded.subject, rarity=excluded.rarity,
  art_kind=excluded.art_kind, art_ref=excluded.art_ref, flavor=excluded.flavor, sort=excluded.sort;

-- ---------------------------------------------------------------------------
-- Helpers: dupe refund value by rarity (Sparks returned for a duplicate pull).
-- ---------------------------------------------------------------------------
create or replace function public._card_dupe_value(p_rarity text)
returns int language sql immutable set search_path = public as $$
  select case p_rarity
    when 'common' then 5
    when 'rare' then 15
    when 'epic' then 40
    when 'legendary' then 90
    when 'mythic' then 200
    else 5 end;
$$;

-- ---------------------------------------------------------------------------
-- open_pack — spend 100 Sparks, weighted-random rarity (PUBLISHED odds),
-- pick a random card of that rarity. Dupe → increment + partial refund.
-- Published odds: common 60 / rare 25 / epic 10 / legendary 4 / mythic 1.
-- ---------------------------------------------------------------------------
create or replace function public.open_pack(p_pack text default 'standard')
returns table(card_id text, name text, rarity text, art_kind text, art_ref text,
              flavor text, is_dupe boolean, refund int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_roll   int;
  v_rarity text;
  v_card   public.card_catalog;
  v_dupe   boolean := false;
  v_refund int := 0;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  -- Charge for the pack (throws 'insufficient_coins' if short).
  perform public.spend_coins(100, 'open_pack', jsonb_build_object('pack', p_pack));

  -- Weighted rarity roll out of 100 (matches the published disclosure exactly).
  v_roll := floor(random() * 100)::int;  -- 0..99
  v_rarity := case
    when v_roll < 60 then 'common'    -- 60
    when v_roll < 85 then 'rare'      -- 25
    when v_roll < 95 then 'epic'      -- 10
    when v_roll < 99 then 'legendary' -- 4
    else 'mythic'                     -- 1
  end;

  -- Pick a random card of that rarity. Fall back across rarities if (somehow)
  -- the bucket is empty so a paid pack always yields a card.
  select * into v_card from public.card_catalog where card_catalog.rarity = v_rarity
    order by random() limit 1;
  if not found then
    select * into v_card from public.card_catalog order by random() limit 1;
  end if;
  if not found then raise exception 'no cards available'; end if;

  -- Insert or increment.
  if exists (select 1 from public.user_cards uc where uc.user_id = v_uid and uc.card_id = v_card.id) then
    update public.user_cards uc set count = uc.count + 1
      where uc.user_id = v_uid and uc.card_id = v_card.id;
    v_dupe := true;
    v_refund := public._card_dupe_value(v_card.rarity);
    perform public.credit_coins(v_refund, 'dupe_refund',
      jsonb_build_object('card_id', v_card.id, 'rarity', v_card.rarity));
  else
    insert into public.user_cards(user_id, card_id) values (v_uid, v_card.id);
  end if;

  return query select v_card.id, v_card.name, v_card.rarity, v_card.art_kind,
                      v_card.art_ref, v_card.flavor, v_dupe, v_refund;
end $$;

-- ---------------------------------------------------------------------------
-- get_collection — every catalog card with the caller's owned count (0 if not).
-- ---------------------------------------------------------------------------
create or replace function public.get_collection()
returns table(card_id text, name text, subject text, rarity text, art_kind text,
              art_ref text, flavor text, sort int, count int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.subject, c.rarity, c.art_kind, c.art_ref, c.flavor, c.sort,
         coalesce(uc.count, 0)
  from public.card_catalog c
  left join public.user_cards uc on uc.card_id = c.id and uc.user_id = auth.uid()
  order by c.subject nulls last,
           array_position(array['common','rare','epic','legendary','mythic'], c.rarity),
           c.sort, c.name;
$$;

-- ---------------------------------------------------------------------------
-- sell_dupe — if count>1, decrement one copy and credit its dupe value.
-- Returns the caller's new Sparks balance.
-- ---------------------------------------------------------------------------
create or replace function public.sell_dupe(p_card_id text)
returns table(coins bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_count  int;
  v_rarity text;
  v_value  int;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select uc.count, c.rarity into v_count, v_rarity
    from public.user_cards uc
    join public.card_catalog c on c.id = uc.card_id
    where uc.user_id = v_uid and uc.card_id = p_card_id;
  if not found or v_count is null then raise exception 'card not owned'; end if;
  if v_count <= 1 then raise exception 'no duplicate to sell'; end if;

  update public.user_cards uc set count = uc.count - 1
    where uc.user_id = v_uid and uc.card_id = p_card_id;
  v_value := public._card_dupe_value(v_rarity);
  perform public.credit_coins(v_value, 'sell_dupe',
    jsonb_build_object('card_id', p_card_id, 'rarity', v_rarity));

  return query select w.coins from public.get_wallet() w;
end $$;

grant execute on function
  public._card_dupe_value(text),
  public.open_pack(text),
  public.get_collection(),
  public.sell_dupe(text)
  to anon, authenticated;
