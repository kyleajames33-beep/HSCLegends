-- Free Legend-card drop on a campaign boss defeat (mirrors open_pack's gacha,
-- no Sparks cost, with better boss-reward odds).
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
  select * into v_card from public.card_catalog where card_catalog.rarity = v_rarity order by random() limit 1;
  if not found then select * into v_card from public.card_catalog order by random() limit 1; end if;
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

GRANT EXECUTE ON FUNCTION public.campaign_loot() TO authenticated;