import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

export type DuelMatch = { duel_id: string; is_opponent: boolean; opp_name: string | null; opp_elo: number | null };
export type DuelQ = { index: number; total: number; stem: string | null; options: string[] | null };
export type DuelResult = {
  status: string; my_score: number; opp_score: number | null;
  outcome: 'win' | 'loss' | 'draw' | 'pending'; my_elo: number; my_delta: number | null; opp_name: string | null;
};
export type LadderRow = { rank: number; name: string; elo: number; wins: number; losses: number; is_me: boolean };

export async function duelFindOrCreate(sb: SupabaseClient, subject: Subject, year: 11 | 12, ranked: boolean): Promise<DuelMatch> {
  const { data, error } = await sb.rpc('duel_find_or_create', { p_subject: subject, p_year: year, p_ranked: ranked });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function duelQuestion(sb: SupabaseClient, duel: string, index: number): Promise<DuelQ> {
  const { data, error } = await sb.rpc('duel_question', { p_duel: duel, p_index: index });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function duelAnswer(sb: SupabaseClient, duel: string, index: number, choice: number) {
  const { data, error } = await sb.rpc('duel_answer', { p_duel: duel, p_index: index, p_choice: choice });
  if (error) throw new Error(error.message);
  return data[0] as { correct: boolean; correct_index: number };
}

export async function duelResult(sb: SupabaseClient, duel: string): Promise<DuelResult> {
  const { data, error } = await sb.rpc('duel_result', { p_duel: duel });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function getDuelLadder(sb: SupabaseClient, subject: Subject, year: 11 | 12): Promise<LadderRow[]> {
  const { data, error } = await sb.rpc('get_duel_ladder', { p_subject: subject, p_year: year, p_limit: 50 });
  if (error) throw new Error(error.message);
  return (data ?? []) as LadderRow[];
}

// New players start at 1200 ELO (see duel_result default). Your own row is readable directly.
export const DUEL_START_ELO = 1200;
export async function duelMyElo(sb: SupabaseClient, userId: string, subject: Subject, year: 11 | 12): Promise<{ elo: number; wins: number; losses: number }> {
  const { data } = await sb.from('duel_elo').select('elo,wins,losses').eq('user_id', userId).eq('subject', subject).eq('year_group', year).maybeSingle();
  return (data as { elo: number; wins: number; losses: number } | null) ?? { elo: DUEL_START_ELO, wins: 0, losses: 0 };
}

// Highest ELO across all the player's subjects — their headline Duel rank (null if never ranked).
export async function duelPeak(sb: SupabaseClient, userId: string): Promise<{ elo: number; subject: string; year: number } | null> {
  const { data } = await sb.from('duel_elo').select('elo,subject,year_group').eq('user_id', userId).order('elo', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const d = data as { elo: number; subject: string; year_group: number };
  return { elo: d.elo, subject: d.subject, year: d.year_group };
}

// Pure ELO → division mapping. 1200 (the starting rating) sits at the bottom of Gold,
// so new players begin mid-ladder with room to climb (👑 Legend) or slip (🥉 Bronze).
export type DuelTier = { key: string; name: string; icon: string; color: string; min: number };
const DUEL_TIERS: DuelTier[] = [
  { key: 'bronze',   name: 'Bronze',   icon: '🥉', color: '#b3743a', min: 0 },
  { key: 'silver',   name: 'Silver',   icon: '🥈', color: '#97a3ad', min: 1100 },
  { key: 'gold',     name: 'Gold',     icon: '🥇', color: '#e0a92e', min: 1200 },
  { key: 'platinum', name: 'Platinum', icon: '💠', color: '#36b6c9', min: 1350 },
  { key: 'diamond',  name: 'Diamond',  icon: '💎', color: '#5b8bff', min: 1500 },
  { key: 'master',   name: 'Master',   icon: '🔮', color: '#a35cf0', min: 1700 },
  { key: 'legend',   name: 'Legend',   icon: '👑', color: '#ff5d8f', min: 1950 },
];
export function duelTier(elo: number): DuelTier & { next: number | null; progress: number; toNext: number } {
  let i = 0;
  for (let k = 0; k < DUEL_TIERS.length; k++) if (elo >= DUEL_TIERS[k].min) i = k;
  const t = DUEL_TIERS[i];
  const next = i + 1 < DUEL_TIERS.length ? DUEL_TIERS[i + 1].min : null;
  const progress = next == null ? 1 : Math.max(0, Math.min(1, (elo - t.min) / (next - t.min)));
  return { ...t, next, progress, toNext: next == null ? 0 : next - elo };
}
