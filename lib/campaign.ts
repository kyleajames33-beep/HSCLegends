import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

export type CampaignBoss = {
  subject: Subject;
  stage: number;
  hp: number;
  max_hp: number;
  defeated_count: number;
};

export type AttackResult = {
  hp: number;
  max_hp: number;
  stage: number;
  defeated: boolean;
  reward: number;
};

export async function getCampaign(sb: SupabaseClient): Promise<CampaignBoss[]> {
  const { data, error } = await sb.rpc('get_campaign');
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignBoss[];
}

export async function campaignAttack(
  sb: SupabaseClient,
  { subject, correct, difficulty }: { subject: Subject; correct: boolean; difficulty?: number }
): Promise<AttackResult> {
  const { data, error } = await sb.rpc('campaign_attack', {
    p_subject: subject,
    p_correct: correct,
    p_difficulty: difficulty ?? 1,
  });
  if (error) throw new Error(error.message);
  return data[0] as AttackResult;
}

export type DefeatResult = { stage: number; max_hp: number; reward: number };

export type ClearRow = {
  rank: number; name: string; clear_ms: number; stage: number;
  is_me: boolean; avatar_style: string | null; avatar_seed: string | null;
};

// Record a campaign boss clear time + fetch the fastest-clears leaderboard.
export async function recordCampaignClear(sb: SupabaseClient, subject: Subject, stage: number, clearMs: number): Promise<void> {
  const { error } = await sb.rpc('campaign_record_clear', { p_subject: subject, p_stage: stage, p_clear_ms: clearMs });
  if (error) throw new Error(error.message);
}

export async function campaignLeaderboard(sb: SupabaseClient, subject: Subject, limit = 20): Promise<ClearRow[]> {
  const { data, error } = await sb.rpc('campaign_leaderboard', { p_subject: subject, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClearRow[];
}

// Battle v3: the fight runs client-side (HP resets each game). On a confirmed
// defeat this persists ONLY the unlock — advance the stage + award the reward.
export async function campaignDefeat(sb: SupabaseClient, subject: Subject): Promise<DefeatResult> {
  const { data, error } = await sb.rpc('campaign_defeat', { p_subject: subject });
  if (error) throw new Error(error.message);
  return data[0] as DefeatResult;
}
