import type { SupabaseClient } from '@supabase/supabase-js';

export type SpinStatus = { can_spin: boolean; ladder_day: number };
export type SpinResult = { reward: number; ladder_day: number };
export type StreakStatus = { current: number; freezes: number; last_date: string | null };

export async function getSpinStatus(sb: SupabaseClient): Promise<SpinStatus> {
  const { data, error } = await sb.rpc('get_spin_status');
  if (error) throw new Error(error.message);
  return (data?.[0] as SpinStatus) ?? { can_spin: true, ladder_day: 0 };
}

export async function spinDaily(sb: SupabaseClient): Promise<SpinResult> {
  const { data, error } = await sb.rpc('spin_daily');
  if (error) throw new Error(error.message);
  return data[0] as SpinResult;
}

export async function getStreakStatus(sb: SupabaseClient): Promise<StreakStatus> {
  const { data, error } = await sb.rpc('get_streak_status');
  if (error) throw new Error(error.message);
  return (data?.[0] as StreakStatus) ?? { current: 0, freezes: 0, last_date: null };
}

// Spend 150 Sparks for one Streak Freeze (mercy; cap 5). Returns new freeze count.
export async function buyStreakFreeze(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb.rpc('buy_streak_freeze');
  if (error) throw new Error(error.message);
  return data as number;
}
