import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

export type DailyResult = {
  xp_awarded: number;
  total_xp: number;
  streak: number;
  streak_event: 'started' | 'extended' | 'freeze_used' | 'reset' | 'already';
  counted: boolean;
};

export async function recordDailyQuiz(
  sb: SupabaseClient, subject: Subject, year: 11 | 12, correct: number, total: number
): Promise<DailyResult> {
  const { data, error } = await sb.rpc('record_daily_quiz', {
    p_subject: subject, p_year: year, p_correct: correct, p_total: total,
  });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function getDailyDone(sb: SupabaseClient): Promise<string[]> {
  const { data, error } = await sb.rpc('get_daily_done');
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}

export type BoardRow = { rank: number; name: string; score: number; is_me: boolean };

export async function getSubjectLeaderboard(
  sb: SupabaseClient, subject: Subject, year: 11 | 12, period: 'day' | 'week'
): Promise<BoardRow[]> {
  const { data, error } = await sb.rpc('get_subject_leaderboard', {
    p_subject: subject, p_year: year, p_period: period, p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BoardRow[];
}
