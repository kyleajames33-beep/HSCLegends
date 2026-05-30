import type { SupabaseClient } from '@supabase/supabase-js';

export type Subject =
  | 'biology'
  | 'chemistry'
  | 'physics'
  | 'maths-standard'
  | 'maths-advanced'
  | 'maths-ext1';

export const SUBJECTS: { id: Subject; label: string }[] = [
  { id: 'biology', label: 'Biology' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'physics', label: 'Physics' },
  { id: 'maths-standard', label: 'Maths Standard' },
  { id: 'maths-advanced', label: 'Maths Advanced' },
  { id: 'maths-ext1', label: 'Maths Ext 1' },
];

// Row shape returned by the get_quiz_questions RPC (questions table columns).
export type Question = {
  id: string;
  subject: Subject;
  year: number;
  module: string;
  lesson_id: string;
  topic: string;
  topics: string[];
  stem: string;
  options: string[];
  correct_index: number;
  explanation: string;
  difficulty: number;
  bloom: string;
  quality: 'original' | 'variant';
  source: 'question-bank' | 'review';
};

export type QuizOpts = {
  subject: Subject;
  year?: 11 | 12;
  module?: string | null;
  difficulty?: 1 | 2 | 3 | null;
  count?: number;
  exclude?: string[];
};

// Thin wrapper over the P0-5 selector function. The spine the whole app reads through.
export async function getQuizQuestions(
  supabase: SupabaseClient,
  opts: QuizOpts
): Promise<Question[]> {
  const { data, error } = await supabase.rpc('get_quiz_questions', {
    p_subject: opts.subject,
    p_year: opts.year ?? null,
    p_module: opts.module ?? null,
    p_difficulty: opts.difficulty ?? null,
    p_count: opts.count ?? 10,
    p_exclude: opts.exclude ?? [],
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Question[];
}
