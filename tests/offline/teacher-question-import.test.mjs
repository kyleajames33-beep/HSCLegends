import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_IMPORT_BYTES, validateTeacherQuestions } from '../../lib/teacher-question-import.mjs';

const question = { id: 'teacher-1', stem: 'Which gas is produced?', options: ['Hydrogen', 'Oxygen'], correctIndex: 1, explanation: 'Oxygen is produced in this example.', subject: 'chemistry', year: 12, module: 'module-5', syllabusVersion: '2017', source: 'Teacher-created' };
const csvHeader = 'id,stem,option_a,option_b,option_c,answer,explanation,subject,year,module,syllabus_version,source';

test('teacher JSON preserves provenance, answer, explanation and unreviewed status through draft round trips', () => {
  const checked = validateTeacherQuestions(JSON.stringify([question]), 'json');
  assert.equal(checked.valid, true);
  assert.deepEqual(checked.draft.questions, [question]);
  assert.equal(checked.draft.reviewStatus, 'unreviewed');
  const reopened = validateTeacherQuestions(JSON.stringify({ ...checked.draft, reviewStatus: 'approved' }), 'json');
  assert.equal(reopened.draft.reviewStatus, 'unreviewed');
  assert.deepEqual(reopened.draft.questions, [question]);
});

test('CSV handles quoted commas, escaped quotes and embedded line breaks without shifting the answer', () => {
  const csv = `\uFEFF${csvHeader}\r\nteacher-1,"Which gas, if any, is produced?","Hydrogen","Oxygen, O₂",,B,"First line.\nThen say ""why"".",chemistry,12,module-5,2017,Teacher-created\r\n`;
  const result = validateTeacherQuestions(csv, 'csv');
  assert.equal(result.valid, true);
  assert.equal(result.draft.questions[0].correctIndex, 1);
  assert.equal(result.draft.questions[0].options[1], 'Oxygen, O₂');
  assert.equal(result.draft.questions[0].explanation, 'First line.\nThen say "why".');
});

test('missing or ambiguous content blocks export rather than being silently dropped', () => {
  for (const patch of [
    { options: ['Oxygen', 'Oxygen'] }, { correctIndex: 3 }, { correctIndex: '1' }, { explanation: '' },
    { explanation: 'TBD' }, { subject: 'unknown' }, { year: 10 }, { module: '' }, { syllabusVersion: '' }, { source: '' },
    { stem: 'Refer to the diagram below.' }, { media: { url: 'https://example.invalid/image.png' } },
    { options: ['Hydrogen', '<img src="/x">'] }, { options: { A: 'Hydrogen', B: 'Oxygen' } }, { extraField: 'would be lost' },
  ]) {
    const result = validateTeacherQuestions(JSON.stringify([{ ...question, ...patch }]), 'json');
    assert.equal(result.valid, false, JSON.stringify(patch));
    assert.equal(result.draft, null);
    assert.ok(result.results[0].errors.length);
  }
  const duplicate = validateTeacherQuestions(JSON.stringify([question, { ...question, id: 'different' }]), 'json');
  assert.equal(duplicate.valid, false); assert.match(duplicate.results[1].errors.join(' '), /duplicated/);
});

test('invalid CSV shape, excess rows and oversized input fail closed', () => {
  for (const csv of [
    `${csvHeader}\n"unterminated`,
    `${csvHeader}\n"bad" extra,1,2`,
    `${csvHeader},unknown\n`,
    `${csvHeader}\nonly,two`,
    `${csvHeader}\n${Array(21).fill('x').join('\n')}`,
  ]) assert.throws(() => validateTeacherQuestions(csv, 'csv'));
  assert.throws(() => validateTeacherQuestions(JSON.stringify(Array(21).fill(question)), 'json'), /at most 20/);
  assert.throws(() => validateTeacherQuestions(JSON.stringify({ format: 'hsc-legends-question-draft', version: 1, questions: [question], missingContext: 'would be lost' }), 'json'), /unsupported fields/);
  assert.throws(() => validateTeacherQuestions('é'.repeat(MAX_IMPORT_BYTES / 2 + 1), 'json'), /too large/);
  assert.throws(() => validateTeacherQuestions('[]', 'json'), /no questions/);
});
