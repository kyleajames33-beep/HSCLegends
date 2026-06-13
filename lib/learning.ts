import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

// Learning Engine — typed wrappers over the SECURITY DEFINER RPCs in
// supabase/migrations/20260613_learning_engine.sql.
// RPC convention matches lib/duel.ts: throw on error, return data[0] or data.

export type TopicMastery = { topic: string; level: number; points: number };

export type ReviewQuestion = {
  id: string;
  subject: Subject;
  topic: string;
  stem: string;
  options: string[];
  correct_index: number;
  explanation: string;
  due_at: string;
  interval_days: number;
};

export type SubjectProgress = {
  subject: Subject | 'overall';
  attempts: number;
  mastery_pct: number; // 0..100
  band_low: number;    // 1..6
  band_high: number;   // 1..6
};

export type WeakTopic = {
  subject: Subject;
  topic: string;
  level: number;   // 0..3
  pct: number;     // 0..100
  due_count: number;
};

// Self-grade buttons map to the SM-2 grades used by grade_review.
export type ReviewGrade = 0 | 1 | 2 | 3; // Again / Hard / Good / Easy

export const LEVEL_LABELS = ['New', 'Familiar', 'Proficient', 'Mastered'] as const;

export function levelLabel(level: number): string {
  return LEVEL_LABELS[Math.max(0, Math.min(3, level))] ?? 'New';
}

// Map an NSW HSC band number (1..6) to its display label.
export function bandLabel(band: number): string {
  return `Band ${Math.max(1, Math.min(6, Math.round(band)))}`;
}

// Render a band RANGE encouragingly, e.g. "Band 3–4" (collapses if low===high).
export function bandRange(low: number, high: number): string {
  return low === high ? bandLabel(low) : `Band ${low}–${high}`;
}

// Called from the quiz answer flow on EVERY answer. See INTEGRATION HOOK.
export async function recordAttempt(
  sb: SupabaseClient,
  args: { questionId: string; subject: string; topic: string | null; correct: boolean; confidence?: number | null }
): Promise<TopicMastery> {
  const { data, error } = await sb.rpc('record_attempt', {
    p_question_id: args.questionId,
    p_subject: args.subject,
    p_topic: args.topic,
    p_correct: args.correct,
    p_confidence: args.confidence ?? null,
  });
  if (error) throw new Error(error.message);
  return data[0] as TopicMastery;
}

export async function getDueReviews(sb: SupabaseClient, limit = 15): Promise<ReviewQuestion[]> {
  const { data, error } = await sb.rpc('get_due_reviews', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReviewQuestion[];
}

export async function gradeReview(
  sb: SupabaseClient,
  questionId: string,
  grade: ReviewGrade
): Promise<{ due_at: string; interval_days: number }> {
  const { data, error } = await sb.rpc('grade_review', { p_question_id: questionId, p_grade: grade });
  if (error) throw new Error(error.message);
  return data[0] as { due_at: string; interval_days: number };
}

export async function getProgress(sb: SupabaseClient): Promise<SubjectProgress[]> {
  const { data, error } = await sb.rpc('get_progress');
  if (error) throw new Error(error.message);
  return (data ?? []) as SubjectProgress[];
}

export async function getWeakTopics(
  sb: SupabaseClient,
  subject: Subject | null = null,
  limit = 6
): Promise<WeakTopic[]> {
  const { data, error } = await sb.rpc('get_weak_topics', { p_subject: subject, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as WeakTopic[];
}
