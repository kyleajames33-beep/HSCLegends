// Staging candidate only. This does not publish content or certify its accuracy.
import { validateTeacherQuestions } from '../teacher-question-import.mjs';
import { prepareCreateRequest } from './index.ts';

/** Revalidate the source and retain its metadata in the matching staging SQL candidate. */
export function prepareTeacherDraftRequest(text, requestId, seconds, contentRevision) {
  const checked = validateTeacherQuestions(text, 'json');
  if (!checked.valid || !checked.draft) throw new Error('INVALID_TEACHER_DRAFT');
  return prepareCreateRequest(requestId, draftQuestions(checked.draft, contentRevision), seconds);
}

/** Map a validated teacher draft to classroom questions with their unreviewed metadata. */
export function draftQuestions(draft, contentRevision) {
  return draft.questions.map(question => ({
    stem: question.stem, options: question.options, correct_index: question.correctIndex, content_revision: contentRevision,
    teacher_draft: { id: question.id, explanation: question.explanation, subject: question.subject,
      year: question.year, module: question.module, syllabusVersion: question.syllabusVersion,
      source: question.source, reviewStatus: 'unreviewed' },
  }));
}
