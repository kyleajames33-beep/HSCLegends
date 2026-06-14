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
