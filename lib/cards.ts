import type { SupabaseClient } from '@supabase/supabase-js';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type ArtKind = 'boss' | 'emoji' | 'dicebear';

// Single card pulled from a pack (open_pack result row).
export type PullCard = {
  card_id: string;
  name: string;
  rarity: Rarity;
  art_kind: ArtKind;
  art_ref: string;
  flavor: string;
  is_dupe: boolean;
  refund: number;
};

// A catalog card joined with how many the caller owns (get_collection row).
export type OwnedCard = {
  card_id: string;
  name: string;
  subject: string | null;
  rarity: Rarity;
  art_kind: ArtKind;
  art_ref: string;
  flavor: string;
  sort: number;
  count: number;
};

export const PACK_COST = 100;

// Rarity display config + the PUBLISHED drop odds (must match the migration).
// `odds` is the % chance; `dupe` is the Sparks refunded on a duplicate pull.
export const RARITY: Record<Rarity, {
  label: string;
  odds: number;
  dupe: number;
  text: string;      // text colour
  border: string;    // frame border colour
  glow: string;      // box-shadow glow colour (rgba-ish via tailwind)
  chip: string;      // small badge background
  ring: string;      // ring colour utility
}> = {
  common: {
    label: 'Common', odds: 60, dupe: 5,
    text: 'text-slate-500', border: 'border-slate-300', glow: 'shadow-slate-300/50',
    chip: 'bg-slate-200 text-slate-700', ring: 'ring-slate-300',
  },
  rare: {
    label: 'Rare', odds: 25, dupe: 15,
    text: 'text-blue-600', border: 'border-blue-400', glow: 'shadow-blue-400/60',
    chip: 'bg-blue-100 text-blue-700', ring: 'ring-blue-400',
  },
  epic: {
    label: 'Epic', odds: 10, dupe: 40,
    text: 'text-plum', border: 'border-plum', glow: 'shadow-plum/60',
    chip: 'bg-plum/15 text-plumdeep', ring: 'ring-plum',
  },
  legendary: {
    label: 'Legendary', odds: 4, dupe: 90,
    text: 'text-golddeep', border: 'border-gold', glow: 'shadow-gold/70',
    chip: 'bg-gold/25 text-golddeep', ring: 'ring-gold',
  },
  mythic: {
    label: 'Mythic', odds: 1, dupe: 200,
    text: 'text-berrydeep', border: 'border-berry', glow: 'shadow-berry/70',
    chip: 'bg-berry/20 text-berrydeep', ring: 'ring-berry',
  },
};

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

// Resolve the image src for a card whose art is a boss sprite.
export function cardImageSrc(card: { art_kind: ArtKind; art_ref: string }): string | null {
  return card.art_kind === 'boss' ? `/bosses/${card.art_ref}/idle.png` : null;
}

export async function openPack(sb: SupabaseClient, pack = 'standard'): Promise<PullCard> {
  const { data, error } = await sb.rpc('open_pack', { p_pack: pack });
  if (error) throw new Error(error.message);
  return data[0] as PullCard;
}

export async function getCollection(sb: SupabaseClient): Promise<OwnedCard[]> {
  const { data, error } = await sb.rpc('get_collection');
  if (error) throw new Error(error.message);
  return (data ?? []) as OwnedCard[];
}

// Sells one duplicate of a card; returns the new Sparks balance.
export async function sellDupe(sb: SupabaseClient, cardId: string): Promise<number> {
  const { data, error } = await sb.rpc('sell_dupe', { p_card_id: cardId });
  if (error) throw new Error(error.message);
  return (data?.[0]?.coins ?? 0) as number;
}
