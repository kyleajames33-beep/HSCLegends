export const MAX_IMPORT_BYTES: number;
export const MAX_IMPORT_QUESTIONS: number;
export type TeacherQuestion = { id: string; stem: string; options: string[]; correctIndex: number; explanation: string; subject: string; year: number; module: string; syllabusVersion: string; source: string };
export type TeacherDraft = { format: 'hsc-legends-question-draft'; version: 1; reviewStatus: 'unreviewed'; questions: TeacherQuestion[] };
export type TeacherImportResult = { results: { row: number; question: TeacherQuestion | null; errors: string[] }[]; valid: boolean; draft: TeacherDraft | null };
export function validateTeacherQuestions(text: string, format: 'csv' | 'json', options?: { maxQuestions?: number }): TeacherImportResult;
