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
