import type { SupabaseClient } from '@supabase/supabase-js';

export type SeasonTier = {
  season_id: string;
  name: string;
  ends_on: string;
  season_xp: number;
  tier: number;
  xp_required: number;
  reward_kind: 'coins' | 'powerup' | 'card';
  reward_ref: string | null;
  reward_amount: number;
  label: string;
  unlocked: boolean;
  claimed: boolean;
};

export function rewardIcon(kind: string) {
  return kind === 'coins' ? '✨' : kind === 'powerup' ? '⚡' : '🃏';
}

export async function getSeason(sb: SupabaseClient): Promise<SeasonTier[]> {
  const { data, error } = await sb.rpc('get_season');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: SeasonTier) => ({ ...r, season_xp: Number(r.season_xp) }));
}

export async function claimSeasonTier(sb: SupabaseClient, tier: number): Promise<string> {
  const { data, error } = await sb.rpc('claim_season_tier', { p_tier: tier });
  if (error) throw new Error(error.message);
  return data as string;
}
