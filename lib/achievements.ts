import type { SupabaseClient } from '@supabase/supabase-js';

export type Achievement = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  progress: number;
  threshold: number;
  unlocked: boolean;
  sort: number;
};

export async function getAchievements(sb: SupabaseClient): Promise<Achievement[]> {
  const { data, error } = await sb.rpc('get_achievements');
  if (error) throw new Error(error.message);
  return (data ?? []) as Achievement[];
}
