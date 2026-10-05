import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessQuestion } from '../../scripts/lib/question-integrity.mjs';
import { identifySourceCurriculum } from '../../scripts/lib/source-curriculum.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/question-sources/pinned-rows.json', import.meta.url)));
const valid = { id: 'synthetic', prompt: 'Choose the declared fixture value.', options: ['First value', 'Second value'], correctIndex: 1, explanation: 'The fixture declares the second value correct.' };
const bank = (questions) => `window.HSCQuestionBankData.lesson = {questions: ${JSON.stringify(questions)}};`;
const bankPath = 'subjects/physics/year12/module5/question-bank-data.js';
function run(files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legends-offline-coverage-'));
  try {
    fs.mkdirSync(path.join(tmp, 'subjects'), { recursive: true });
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tmp, file)), { recursive: true });
      fs.writeFileSync(path.join(tmp, file), text);
    }
    const out = path.join(tmp, 'questions.json');
    const result = spawnSync(process.execPath, ['--import', path.join(root, 'tests/support/deny-network.mjs'), path.join(root, 'scripts/normalise-banks.mjs'), tmp, out], { cwd: root, encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH } });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    return { ...result, questions: JSON.parse(fs.readFileSync(out)), audit: JSON.parse(fs.readFileSync(`${out}.audit.json`)) };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

test('COVERAGE: 18 pinned raw records preserve their source-declared keys', () => {
  assert.equal(fixture.rows.length, 18);
  for (const row of fixture.rows) {
    const assessed = assessQuestion(row.raw);
    assert.deepEqual(assessed.reasons, [], row.file);
    assert.equal(assessed.correctIndex, row.expectedIndex, row.file);
    assert.equal(assessed.options[assessed.correctIndex], row.expectedAnswer, row.file);
    assert.equal(assessed.explanation, row.raw.explanation);
    assert.equal(assessed.contentReview, 'not-assessed');
  }
});

test('COVERAGE: letter keys reject out-of-range, malformed and conflicting declarations', () => {
  for (const raw of [
    { ...valid, correct: 'A' }, { ...valid, answer: 'A' },
    { ...valid, correctIndex: undefined, answer: 'B' },
    { ...valid, correct: '1' }, { ...valid, correct: 'BB' },
    { ...valid, correctIndex: 9 }, { ...valid, answer: 'Z' },
    { prompt: valid.prompt, options: { A: 'One', a: 'Two' }, answer: 'A' },
  ]) assert.ok(assessQuestion(raw).reasons.length, JSON.stringify(raw));
  const matching = assessQuestion({ ...valid, options: { A: 'First value', B: 'Second value' }, answer: 'b', correctAnswer: 'B' });
  assert.deepEqual(matching.reasons, []);
  assert.equal(matching.correctIndex, 1);
});

test('COVERAGE: complete pinned Extension 1 source stays at 40 runtime questions and 120 omissions', () => {
  const source = fs.readFileSync(new URL('../fixtures/question-sources/ext1-module9.source.txt', import.meta.url));
  const blob = crypto.createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
  assert.equal(blob, '55de724610072a84f0b5ba08aa7e97a875b5839c');
  const result = run({ 'subjects/maths-advanced/extension1/year12/module9/question-bank-data.js': source });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.questions.length, 40);
  assert.equal(result.audit.summary.omittedBySource, 120);
  assert.ok(result.questions.every((q) => q.subject === 'maths-ext1' && q.module === 'module-9' && q.difficulty === 3));
  assert.ok(result.questions.every((q) => !/^Question \d+ for Lesson/.test(q.stem)));
});

test('COVERAGE: Extension 2 never falls through to Maths Advanced', () => {
  const row = fixture.rows.find((q) => q.file.includes('/extension2/'));
  const result = run({ [bankPath]: bank([valid]), [row.file]: bank([row.raw]) });
  assert.equal(result.status, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(result.audit.summary.unsupportedHscFiles, 1);
  assert.equal(result.audit.unsupportedQuestions[0].curriculumIdentity.courseDirectory, 'maths-advanced/extension2');
  assert.equal(result.audit.unsupportedQuestions[0].curriculumIdentity.targetSubject, null);
  assert.equal(result.audit.skippedFiles[0].reason, 'unsupported-course-identity');
});

test('COVERAGE: unsupported senior courses are visible failures, while juniors stay outside scope', () => {
  const row = fixture.rows.find((q) => q.file.includes('/health-movement-science/'));
  const result = run({ [bankPath]: bank([valid]), [row.file]: bank([row.raw]), 'subjects/science/year8/unit1/question-bank-data.js': 'This junior file is not executed.' });
  assert.equal(result.status, 1);
  assert.equal(result.audit.summary.unsupportedHscFiles, 1);
  assert.equal(result.audit.summary.blockedCurriculumQuestions, 1);
  assert.equal(result.audit.summary.fileErrors, 0);
  assert.equal(result.audit.skippedFiles.find((q) => q.file === row.file).hscLayoutNeedsReview, true);
});

test('COVERAGE: focus-area numbers and source lesson IDs never authorize a legacy module alias', () => {
  for (const subject of ['biology', 'physics']) {
    const row = fixture.rows.find((q) => q.file.startsWith(`subjects/${subject}/year11/fa1-`));
    const result = run({ [bankPath]: bank([valid]), [row.file]: bank([row.raw]), [`subjects/${subject}/curriculum-map.json`]: JSON.stringify(fixture.curriculumMaps[subject]) });
    assert.equal(result.status, 1);
    assert.equal(result.questions.length, 1);
    const identity = result.audit.unsupportedQuestions[0].curriculumIdentity;
    assert.equal(identity.unitKind, 'focus-area');
    assert.equal(identity.targetModule, null);
    assert.equal(identity.curriculumMap.status, 'exact-source-unit-match');
    assert.match(identity.curriculumMap.unit.outcome, /^(BI|PY)-11-01$/);
    assert.equal(result.audit.unsupportedQuestions[0].question.explanation, row.raw.explanation);
  }
});

test('COVERAGE: named-unit maths preserves source identity even when its legacy lesson ID says module 5', () => {
  const row = fixture.rows.find((q) => q.file.includes('/bivariate-data-analysis/'));
  assert.match(row.lessonId, /-m5-/);
  const identity = identifySourceCurriculum(row.file, fixture.curriculumMaps['maths-standard']);
  assert.equal(identity.meta, null);
  assert.equal(identity.identity.curriculumMap.unit.outcome, 'MST-12-S2-08');
  assert.equal(identity.identity.targetModule, null);
});

test('COVERAGE: exact course paths cannot absorb nested aliases, archived folders or module-zero typos', () => {
  for (const file of [
    'subjects/maths-advanced/extension3/year12/module11/question-bank-data.js',
    'subjects/physics/archive/year12/module5/question-bank-data.js',
    'subjects/physics/year12/archive/module5/question-bank-data.js',
    'subjects/physics/year12/module0/question-bank-data.js',
    'subjects/physics/year12/module5/archive/question-bank-data.js',
  ]) {
    const result = identifySourceCurriculum(file);
    assert.equal(result.meta, null, file);
    assert.equal(result.hscLayoutNeedsReview, true, file);
  }
});

test('COVERAGE: an absent current curriculum-map entry is disclosed rather than invented', () => {
  const row = fixture.rows.find((q) => q.file === 'subjects/maths-advanced/year11/module4/question-bank-data.js');
  const result = identifySourceCurriculum(row.file, fixture.curriculumMaps['maths-advanced']);
  assert.equal(result.meta.module, 'module-4');
  assert.equal(result.identity.mappingStatus, 'legacy-module-path-only');
  assert.equal(result.identity.curriculumMap.status, 'no-exact-source-unit-match');
});

test('COVERAGE: malformed curriculum evidence fails visibly and cannot supply an identity', () => {
  const result = run({ [bankPath]: bank([valid]), 'subjects/physics/curriculum-map.json': '{invalid json' });
  assert.equal(result.status, 1);
  assert.equal(result.audit.summary.fileErrors, 1);
  assert.match(result.audit.fileErrors[0].error, /Invalid curriculum evidence/);
});

test('COVERAGE: source dot-point spellings survive as metadata without invented syllabus mappings', () => {
  for (const key of ['dotPoint', 'dotpoint']) {
    const row = fixture.rows.find((q) => Object.hasOwn(q.raw, key));
    assert.ok(row, key);
    const assessed = assessQuestion(row.raw);
    assert.deepEqual(assessed.metadata[key], row.raw[key]);
    assert.equal(Object.hasOwn(assessed.metadata, 'syllabusPoint'), false);
  }
});

test('COVERAGE: directly mutated then emptied runtime banks cannot resurrect legacy rows', () => {
  const source = `const lessonQuestionBanks={lesson:[${JSON.stringify(valid)}]};window.HSCQuestionBankData.lesson={questions:[${JSON.stringify(valid)}]};delete window.HSCQuestionBankData.lesson;`;
  const result = run({ [bankPath]: source });
  assert.equal(result.status, 1);
  assert.deepEqual(result.questions, []);
  assert.equal(result.audit.summary.omittedBySource, 1);
});

test('COVERAGE: unknown bank containers cannot silently disappear beside a valid source', () => {
  const result = run({ [bankPath]: bank([valid]), 'subjects/physics/year12/module6/question-bank-data.js': `const unknownBank={lesson:[${JSON.stringify(valid)}]};` });
  assert.equal(result.status, 1);
  assert.equal(result.audit.summary.fileErrors, 1);
  assert.match(result.audit.fileErrors[0].error, /No supported question-bank container/);
});

test('COVERAGE: non-MC review omissions retain a reason and original row location', () => {
  const result = run({ 'subjects/physics/year12/module5/lesson.review.json': JSON.stringify({ lessonId: 'lesson', questions: [{ id: 'short1', type: 'short', stem: 'A synthetic short-answer question' }, { ...valid, type: 'mc' }] }) });
  assert.equal(result.status, 0);
  assert.equal(result.questions.length, 1);
  assert.deepEqual(result.audit.skippedQuestionTypes, [{ file: 'subjects/physics/year12/module5/lesson.review.json', lessonId: 'lesson', sourceIndex: 0, type: 'short', id: 'short1', reason: 'unsupported-review-question-type' }]);
});
