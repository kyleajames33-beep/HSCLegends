// Practice question bank for Reactor Clash (unreviewed samples).
import { SAMPLE_SET } from '@/lib/live-game';
import { QUESTIONS as EQUILIBRIUM } from '@/prototypes/lab-tycoon/src/content.mjs';

export type ClashQuestion = { stem: string; options: string[]; correct_index: number; content_revision: string; teacher_draft?: { explanation?: string } };

export const PRACTICE_BANK: ClashQuestion[] = [
  ...SAMPLE_SET,
  ...EQUILIBRIUM.map((q: { stem: string; answers: string[]; answer: number; explanation?: string }) => ({
    stem: q.stem, options: q.answers, correct_index: q.answer, content_revision: 'equilibrium-sample-v1',
    teacher_draft: { explanation: q.explanation },
  })),
];
