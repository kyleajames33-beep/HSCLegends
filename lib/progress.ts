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

export type MyWeek = { weekly_xp: number; rank: number; players: number };

export async function getMyWeek(sb: SupabaseClient): Promise<MyWeek> {
  const { data, error } = await sb.rpc('get_my_week');
  if (error) throw new Error(error.message);
  return (data?.[0] as MyWeek) ?? { weekly_xp: 0, rank: 0, players: 0 };
}

// Reversible weekly league tier from this week's XP (resets each week).
export function leagueTier(weeklyXp: number): { name: string; emoji: string; next: number | null } {
  if (weeklyXp >= 700) return { name: 'Diamond', emoji: '💎', next: null };
  if (weeklyXp >= 350) return { name: 'Platinum', emoji: '🔷', next: 700 };
  if (weeklyXp >= 150) return { name: 'Gold', emoji: '🥇', next: 350 };
  if (weeklyXp >= 50) return { name: 'Silver', emoji: '🥈', next: 150 };
  return { name: 'Bronze', emoji: '🥉', next: 50 };
}

export const STREAK_MSG: Record<QuickResult['streak_event'], string> = {
  started: 'Streak started! 🔥',
  extended: 'Streak extended! 🔥',
  freeze_used: 'Streak saved with a freeze ❄️',
  reset: 'Fresh start — streak at 1 🔥',
  already: 'Already counted today ✓',
};
