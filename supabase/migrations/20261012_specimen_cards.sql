-- Specimen cards: earned, not pulled. Each Specimen Lab picture question (lib/specimens.mjs)
-- awards one card the first time the player answers it correctly. Art is HSCScience lesson
-- artwork served from /public/specimens/<art_ref>.webp (art_kind 'image').
--
-- Packs and campaign loot keep their published odds over the original pack cards only:
-- both pickers now filter on source = 'pack', so adding specimens dilutes nothing.

-- 1. Catalog: allow image art and record where a card comes from.
alter table public.card_catalog drop constraint if exists card_catalog_art_kind_check;
alter table public.card_catalog add constraint card_catalog_art_kind_check
  check (art_kind in ('boss','emoji','dicebear','image'));
alter table public.card_catalog add column if not exists source text not null default 'pack';
alter table public.card_catalog drop constraint if exists card_catalog_source_check;
alter table public.card_catalog add constraint card_catalog_source_check
  check (source in ('pack','specimen'));

-- 2. Specimen cards (must match lib/specimens.mjs; tests/offline/specimens.test.mjs checks).
insert into public.card_catalog (id, name, subject, rarity, art_kind, art_ref, flavor, sort, source) values
  ('spec-soda-sealed',         'Sealed Soda',       'chemistry', 'common', 'image', 'soda-sealed',        'Looks still. Busy both ways.',                101, 'specimen'),
  ('spec-soda-open',           'Going Flat',        'chemistry', 'common', 'image', 'soda-open',          'Open system. The fizz is not coming back.',   102, 'specimen'),
  ('spec-campfire-ash',        'Cold Ash',          'chemistry', 'common', 'image', 'campfire-ash',       'Finished. Both rates zero.',                  103, 'specimen'),
  ('spec-iodine-flask',        'Purple Flask',      'chemistry', 'rare',   'image', 'iodine-flask',       'Steady colour, busy molecules.',              104, 'specimen'),
  ('spec-evaporating-beaker',  'Open Beaker',       'chemistry', 'common', 'image', 'evaporating-beaker', 'Two ways in theory. One way in practice.',    105, 'specimen'),
  ('spec-salt-jar',            'Saturated Jar',     'chemistry', 'rare',   'image', 'salt-jar',           'Still-looking does not mean stopped.',        106, 'specimen'),
  ('spec-hot-coffee',          'Cooling Coffee',    'chemistry', 'common', 'image', 'hot-coffee',         'Still changing. Drink it anyway.',            107, 'specimen'),
  ('spec-burned-magnesium',    'Magnesium Ash',     'chemistry', 'rare',   'image', 'burned-magnesium',   'Burned out, for good.',                       108, 'specimen'),
  ('spec-cavendish',           'The Cavendish',     'biology',   'epic',   'image', 'cavendish',          'Every bunch a clone. Every clone at risk.',   101, 'specimen'),
  ('spec-strawberry-runner',   'Strawberry Runner', 'biology',   'common', 'image', 'strawberry-runner',  'One plant, one runner, one copy.',            102, 'specimen'),
  ('spec-strawberry-flower',   'Strawberry Flower', 'biology',   'common', 'image', 'strawberry-flower',  'Where the new mixes begin.',                  103, 'specimen'),
  ('spec-varied-seedlings',    'Seedling Siblings', 'biology',   'rare',   'image', 'varied-seedlings',   'Siblings, not copies.',                       104, 'specimen'),
  ('spec-stable-pond',         'Still Pond',        'biology',   'rare',   'image', 'stable-pond',        'Nothing changes here. Copies win.',           105, 'specimen'),
  ('spec-island-plant',        'Island Castaway',   'biology',   'rare',   'image', 'island-plant',       'No mate. No problem. Copy.',                  106, 'specimen'),
  ('spec-warming-field',       'Dry Field',         'biology',   'epic',   'image', 'warming-field',      'Conditions change. Variation helps.',         107, 'specimen'),
  ('spec-rhizopus',            'Rhizopus',          'biology',   'rare',   'image', 'rhizopus',           'Spore cases up. Spores away.',                108, 'specimen'),
  ('spec-fresh-bread',         'Fresh Slice',       'biology',   'common', 'image', 'fresh-bread',        'Not for long.',                               109, 'specimen')
on conflict (id) do update set
  name=excluded.name, subject=excluded.subject, rarity=excluded.rarity, art_kind=excluded.art_kind,
  art_ref=excluded.art_ref, flavor=excluded.flavor, sort=excluded.sort, source=excluded.source;

-- 3. Pack and campaign pickers: pack cards only (bodies otherwise unchanged from
--    20260613_legend_cards.sql and 20260616085738_campaign_loot_card.sql).
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

  perform public.spend_coins(100, 'open_pack', jsonb_build_object('pack', p_pack));

  v_roll := floor(random() * 100)::int;  -- 0..99
  v_rarity := case
    when v_roll < 60 then 'common'    -- 60
    when v_roll < 85 then 'rare'      -- 25
    when v_roll < 95 then 'epic'      -- 10
    when v_roll < 99 then 'legendary' -- 4
    else 'mythic'                     -- 1
  end;

  select * into v_card from public.card_catalog
    where card_catalog.rarity = v_rarity and card_catalog.source = 'pack'
    order by random() limit 1;
  if not found then
    select * into v_card from public.card_catalog where card_catalog.source = 'pack'
      order by random() limit 1;
  end if;
  if not found then raise exception 'no cards available'; end if;

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

CREATE OR REPLACE FUNCTION public.campaign_loot()
RETURNS TABLE(card_id text, name text, rarity text, art_kind text, art_ref text, flavor text, is_dupe boolean, refund integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); v_roll int; v_rarity text;
  v_card public.card_catalog; v_dupe boolean := false; v_refund int := 0;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  v_roll := floor(random() * 100)::int;
  v_rarity := case
    when v_roll < 40 then 'common' when v_roll < 72 then 'rare'
    when v_roll < 90 then 'epic' when v_roll < 98 then 'legendary' else 'mythic' end;
  select * into v_card from public.card_catalog
    where card_catalog.rarity = v_rarity and card_catalog.source = 'pack' order by random() limit 1;
  if not found then
    select * into v_card from public.card_catalog where card_catalog.source = 'pack' order by random() limit 1;
  end if;
  if not found then raise exception 'no cards available'; end if;
  if exists (select 1 from public.user_cards uc where uc.user_id = v_uid and uc.card_id = v_card.id) then
    update public.user_cards uc set count = uc.count + 1 where uc.user_id = v_uid and uc.card_id = v_card.id;
    v_dupe := true; v_refund := public._card_dupe_value(v_card.rarity);
    perform public.credit_coins(v_refund, 'dupe_refund', jsonb_build_object('card_id', v_card.id, 'rarity', v_card.rarity));
  else
    insert into public.user_cards(user_id, card_id) values (v_uid, v_card.id);
  end if;
  return query select v_card.id, v_card.name, v_card.rarity, v_card.art_kind,
                      v_card.art_ref, v_card.flavor, v_dupe, v_refund;
end $function$;

-- 4. Fail closed until the verified-answer migration installs the grading API.
-- Existing installations are hardened by 20261014*_verified_specimen_answers.sql.
create or replace function public.claim_specimen_card(p_card_id text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'verified correct answer required';
end $$;
revoke all on function public.claim_specimen_card(text) from public, anon;
grant execute on function public.claim_specimen_card(text) to authenticated;
