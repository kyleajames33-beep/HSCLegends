import type { SupabaseClient } from '@supabase/supabase-js';

export type EventInfo = {
  id: string;
  name: string;
  subject: string | null;
  ends_at: string;
  target: number;
  reward_coins: number;
  reward_card: string | null;
  my_points: number;
  my_rank: number;
  player_count: number;
  claimed: boolean;
};
export type EventRow = {
  rank: number; name: string; points: number;
  is_me: boolean; avatar_style: string | null; avatar_seed: string | null;
};

export async function getEvent(sb: SupabaseClient): Promise<EventInfo | null> {
  const { data, error } = await sb.rpc('get_event');
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
}

export async function getEventBoard(sb: SupabaseClient): Promise<EventRow[]> {
  const { data, error } = await sb.rpc('get_event_board');
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

export async function claimEventReward(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.rpc('claim_event_reward');
  if (error) throw new Error(error.message);
  return data as string;
}
