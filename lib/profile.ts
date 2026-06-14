import type { SupabaseClient } from '@supabase/supabase-js';

export type ProfileSummary = {
  name: string;
  avatar_style: string | null;
  avatar_seed: string | null;
  total_xp: number;
  coins: number;
  streak: number;
  freezes: number;
  division: number;
  cards_owned: number;
  cards_total: number;
  ach_unlocked: number;
  ach_total: number;
  answered: number;
  correct: number;
  duels_won: number;
  duels_lost: number;
};

// One aggregate read for the /profile hub. Returns null when signed out.
export async function getProfileSummary(sb: SupabaseClient): Promise<ProfileSummary | null> {
  const { data, error } = await sb.rpc('get_profile_summary');
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    name: row.name ?? 'Legend',
    avatar_style: row.avatar_style ?? null,
    avatar_seed: row.avatar_seed ?? null,
    total_xp: Number(row.total_xp ?? 0),
    coins: Number(row.coins ?? 0),
    streak: Number(row.streak ?? 0),
    freezes: Number(row.freezes ?? 0),
    division: Number(row.division ?? 0),
    cards_owned: Number(row.cards_owned ?? 0),
    cards_total: Number(row.cards_total ?? 0),
    ach_unlocked: Number(row.ach_unlocked ?? 0),
    ach_total: Number(row.ach_total ?? 0),
    answered: Number(row.answered ?? 0),
    correct: Number(row.correct ?? 0),
    duels_won: Number(row.duels_won ?? 0),
    duels_lost: Number(row.duels_lost ?? 0),
  };
}
