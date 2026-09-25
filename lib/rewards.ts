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

// Streak screen read model (get_streak_overview). Weekends never break a streak;
// the free weekly freeze covers one missed weekday, then bought freezes cover more.
export type StreakOverview = {
  current: number;
  freezes: number;
  weekly_freeze_ready: boolean;
  last_date: string | null;
  active_days: string[];
  frozen_days: string[];
  missed_days: number;       // weekdays missed since last play (before today)
  will_reset: boolean;       // playing today would reset — not enough freezes
  repair_open: boolean;      // a broken streak can be won back today
  broken_streak: number | null;
  repair_progress: number;   // questions answered today
  repair_target: number;
  next_repair_on: string | null;
};

export async function getStreakOverview(sb: SupabaseClient): Promise<StreakOverview | null> {
  const { data, error } = await sb.rpc('get_streak_overview');
  if (error) throw new Error(error.message);
  return (data?.[0] as StreakOverview) ?? null;
}

// Win a broken streak back (20 questions today, once per 14 days). Returns the restored streak.
export async function repairStreak(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb.rpc('repair_streak');
  if (error) throw new Error(error.message);
  return data as number;
}
