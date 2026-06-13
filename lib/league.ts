import type { SupabaseClient } from '@supabase/supabase-js';

export const DIVISIONS = [
  { name: 'Bronze',   emoji: '🥉', color: '#a87f3f' },
  { name: 'Silver',   emoji: '🥈', color: '#8a8aa3' },
  { name: 'Gold',     emoji: '🥇', color: '#d6a85f' },
  { name: 'Sapphire', emoji: '🔷', color: '#3b82a0' },
  { name: 'Ruby',     emoji: '🔴', color: '#c4646b' },
  { name: 'Emerald',  emoji: '🟢', color: '#6b9b7c' },
  { name: 'Diamond',  emoji: '💎', color: '#6d5b8a' },
];

export function division(n: number) {
  return DIVISIONS[Math.max(0, Math.min(DIVISIONS.length - 1, n))];
}

export type MyLeague = {
  division: number;
  week_xp: number;
  rank: number;
  member_count: number;
  promote_cutoff: number;
  last_result: 'promoted' | 'relegated' | 'stayed' | null;
};
export type LeagueRow = {
  rank: number; name: string; week_xp: number;
  is_me: boolean; avatar_style: string | null; avatar_seed: string | null;
};

export async function getMyLeague(sb: SupabaseClient): Promise<MyLeague | null> {
  const { data, error } = await sb.rpc('get_my_league');
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { ...row, week_xp: Number(row.week_xp) } : null;
}

export async function getLeagueBoard(sb: SupabaseClient): Promise<LeagueRow[]> {
  const { data, error } = await sb.rpc('get_league_board');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: LeagueRow) => ({ ...r, week_xp: Number(r.week_xp) }));
}
