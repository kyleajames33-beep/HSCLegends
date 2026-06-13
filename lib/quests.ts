import type { SupabaseClient } from '@supabase/supabase-js';

export type Quest = {
  id: string;
  scope: 'daily' | 'weekly';
  title: string;
  target: number;
  reward_coins: number;
  progress: number;
  claimed: boolean;
};

export async function getQuests(sb: SupabaseClient): Promise<Quest[]> {
  const { data, error } = await sb.rpc('get_quests');
  if (error) throw new Error(error.message);
  return (data ?? []) as Quest[];
}

// Claim a completed, unclaimed quest. Returns the caller's new Sparks balance.
export async function claimQuest(sb: SupabaseClient, questId: string): Promise<number> {
  const { data, error } = await sb.rpc('claim_quest', { p_quest_id: questId });
  if (error) throw new Error(error.message);
  return data as number;
}
