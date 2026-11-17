import type { CreateRequest, QuestionDraft } from './index';
import type { TeacherDraft } from '../teacher-question-import.mjs';
export function prepareTeacherDraftRequest(text: string, requestId: string, seconds: number, contentRevision: string): CreateRequest;
export function draftQuestions(draft: TeacherDraft, contentRevision: string): QuestionDraft[];
