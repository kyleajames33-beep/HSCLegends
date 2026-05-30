import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

export type QuickResult = {
  xp_awarded: number;
  total_xp: number;
  streak: number;
  streak_event: 'started' | 'extended' | 'freeze_used' | 'reset' | 'already';
};

// Save a finished solo Quick Game (signed-in only): XP + streak update.
export async function recordQuickGame(
  sb: SupabaseClient,
  subject: Subject,
  year: 11 | 12,
  correct: number,
  total: number
): Promise<QuickResult> {
  const { data, error } = await sb.rpc('record_quick_game', {
    p_subject: subject,
    p_year: year,
    p_correct: correct,
    p_total: total,
  });
  if (error) throw new Error(error.message);
  return data[0];
}

export type LeaderRow = { rank: number; name: string; xp: number; is_me: boolean };

export async function getWeeklyLeaderboard(
  sb: SupabaseClient,
  subject?: Subject | null
): Promise<LeaderRow[]> {
  const { data, error } = await sb.rpc('get_weekly_leaderboard', {
    p_subject: subject ?? null,
    p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaderRow[];
}

export async function setLeaderboardOptIn(sb: SupabaseClient, on: boolean) {
  const { error } = await sb.rpc('set_leaderboard_optin', { p_on: on });
  if (error) throw new Error(error.message);
}

export const STREAK_MSG: Record<QuickResult['streak_event'], string> = {
  started: 'Streak started! 🔥',
  extended: 'Streak extended! 🔥',
  freeze_used: 'Streak saved with a freeze ❄️',
  reset: 'Fresh start — streak at 1 🔥',
  already: 'Already counted today ✓',
};
