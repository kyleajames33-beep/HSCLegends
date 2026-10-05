import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessQuestion } from '../../scripts/lib/question-integrity.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const valid = (overrides = {}) => ({ id: 'synthetic-q1', prompt: 'Which synthetic choice is correct?', options: ['First value', 'Second value'], correctIndex: 1, explanation: 'The fixture declares the second value correct.', ...overrides });
const bank = (questions) => `window.HSCQuestionBankData.lesson = { questions: ${JSON.stringify(questions)} };`;
const bankPath = 'subjects/physics/year12/module5/question-bank-data.js';
function run(files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legends-offline-bank-'));
  try {
    fs.mkdirSync(path.join(tmp, 'subjects'), { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true });
      fs.writeFileSync(path.join(tmp, name), text);
    }
    const out = path.join(tmp, 'questions.json');
    const result = spawnSync(process.execPath, ['--import', path.join(root, 'tests/support/deny-network.mjs'), path.join(root, 'scripts/normalise-banks.mjs'), tmp, out], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    return { status: result.status, stdout: result.stdout, stderr: result.stderr,
      questions: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out)) : null,
      audit: fs.existsSync(`${out}.audit.json`) ? JSON.parse(fs.readFileSync(`${out}.audit.json`)) : null };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

test('IMPORT: all supported answer schemas retain their existing correct option', () => {
  for (const raw of [
    valid(),
    { text: 'Synthetic letter key', options: { B: 'Second', A: 'First' }, correctAnswer: ' b ' },
    { question: 'Synthetic numeric key', options: ['First', 'Second'], answer: 1 },
    { stem: 'Synthetic review', options: ['First', 'Second'], correct: 1 },
    { stem: 'Synthetic string key', options: ['First', 'Second'], correctAnswer: '1' },
  ]) {
    const result = assessQuestion(raw);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.correctIndex, 1);
  }
});

test('IMPORT: rejects malformed questions without inventing string content or integer keys', () => {
  const malformed = [null, false, 7, [], valid({ prompt: {} }), valid({ prompt: ' ' }),
    valid({ options: [' ', 'Second'] }), valid({ options: [null, 'Second'] }),
    valid({ options: [{ text: 'First' }, 'Second'] }), valid({ options: new Array(2) }),
    valid({ options: ['Same', ' Same '] }), valid({ correctIndex: NaN }),
    valid({ correctIndex: Infinity }), valid({ correctIndex: 0.5 }), valid({ correctIndex: -1 }),
    valid({ correctIndex: 2 }), valid({ correctIndex: '1' }), valid({ correctAnswer: ' ' }),
    valid({ correctAnswer: 'not-a-key' }), valid({ correctAnswer: 'A' }),
  ];
  for (const raw of malformed) assert.ok(assessQuestion(raw).reasons.length > 0, JSON.stringify(raw));
});

test('IMPORT: known scaffold prompts, label-only choices and source exclusions are quarantined', () => {
  for (const prompt of ['Question 3 for Lesson 7', 'Sample question 5 for Synthetic Title', 'Quiz question 20']) assert.ok(assessQuestion(valid({ prompt })).reasons.includes('scaffold-stem'));
  assert.ok(assessQuestion(valid({ options: ['A', 'B', 'C', 'D'] })).reasons.includes('label-only-options'));
  assert.ok(assessQuestion(valid({ excluded: true })).reasons.includes('source-excluded'));
  assert.deepEqual(assessQuestion(valid({ prompt: 'What does question 3 demonstrate?' })).reasons, []);
});

test('IMPORT: explanation presence is reported separately from scientific review', () => {
  for (const [explanation, expected] of [[undefined, 'missing'], [' ', 'missing'], ['Explanation.', 'placeholder'], ['Explanation for quiz question 2.', 'placeholder'], ['TBD', 'placeholder'], ['abc', 'present']]) {
    const result = assessQuestion(valid({ explanation }));
    assert.equal(result.explanationStatus, expected);
    assert.equal(result.contentReview, 'not-assessed');
    assert.equal(Object.hasOwn(result, 'verified'), false);
  }
});

test('IMPORT: instructional metadata is copied without mutation or fetching media', () => {
  const media = { type: 'image', src: 'https://example.invalid/never-fetch.svg', alt: 'Synthetic diagram', caption: 'Diagram caption' };
  const raw = valid({ media, syllabusPoint: 'PH12-test', syllabusTier: 'extension', difficulty: 4, bloom: 'evaluate' });
  const assessed = assessQuestion(raw);
  assert.deepEqual(assessed.metadata, { media, syllabusPoint: 'PH12-test', syllabusTier: 'extension', difficulty: 4, bloom: 'evaluate' });
  assert.notEqual(assessed.metadata.media, media);
  assert.ok(assessed.reasons.includes('media-needs-supported-renderer'));
  assert.deepEqual(raw.media, media);
});

test('IMPORT: unsupported syllabus structure and non-JSON metadata cannot silently become strings', () => {
  const cyclic = {}; cyclic.self = cyclic;
  for (const media of [cyclic, () => {}, undefined, NaN]) assert.ok(assessQuestion(valid({ media })).reasons.includes('invalid-media-metadata'));
  const result = assessQuestion(valid({ syllabusPoint: { code: 'PH12-test' } }));
  assert.ok(result.reasons.includes('unsupported-syllabusPoint-shape'));
  assert.deepEqual(result.metadata.syllabusPoint, { code: 'PH12-test' });
});

test('IMPORT CLI: preserves syllabus tags and raw taxonomy in the audit sidecar', () => {
  const result = run({ [bankPath]: bank([valid({ syllabusPoint: 'PH12-test', difficulty: 4, bloom: 'evaluate', syllabusTier: 'extension' })]) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.questions[0].syllabusPoint, 'PH12-test');
  assert.deepEqual(result.audit.questions[0].metadata, { syllabusPoint: 'PH12-test', syllabusTier: 'extension', difficulty: 4, bloom: 'evaluate' });
  assert.equal(result.questions[0].contentReview, 'not-assessed');
  assert.match(result.stdout, /does not establish correctness/);
});

test('IMPORT CLI: does not resurrect filtered questions or entirely omitted legacy lessons', () => {
  const kept = valid(); const removed = valid({ id: 'removed-real-question' });
  const fixture = `const lessonQuestionBanks = { lesson: [${JSON.stringify(kept)}, ${JSON.stringify(removed)}], omitted: [${JSON.stringify(valid({ id: 'omitted-lesson-real-question' }))}] }; window.HSCQuestionBankData = { lesson: { questions: [${JSON.stringify(kept)}] } };`;
  const result = run({ [bankPath]: fixture });
  assert.equal(result.status, 0);
  assert.deepEqual(result.questions.map((q) => q.id), ['synthetic-q1']);
  assert.equal(result.audit.summary.omittedBySource, 2);
  assert.deepEqual(result.audit.sourceSelections[0].omittedLegacyQuestions.map((q) => q.id), ['removed-real-question', 'omitted-lesson-real-question']);
});

test('IMPORT CLI: explicitly published empty runtime banks stay empty', () => {
  const result = run({ [bankPath]: `const lessonQuestionBanks = { lesson: [${JSON.stringify(valid())}] }; window.HSCQuestionBankData = {};` });
  assert.equal(result.status, 1);
  assert.deepEqual(result.questions, []);
  assert.equal(result.audit.summary.omittedBySource, 1);
});

test('IMPORT CLI: legacy-only sources remain supported and scaffold detection is fail-closed', () => {
  const result = run({ [bankPath]: `const lessonQuestionBanks = { lesson: [${JSON.stringify(valid())}, ${JSON.stringify(valid({ id: 'stub', prompt: 'Question 3 for Lesson 7' }))}] };` });
  assert.equal(result.status, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(result.audit.summary.quarantined, 1);
});

test('IMPORT CLI: media-dependent items retain their metadata in quarantine rather than losing diagrams', () => {
  const media = { src: '/synthetic-diagram.svg', alt: 'Synthetic diagram' };
  const result = run({ [bankPath]: bank([valid({ media, syllabusPoint: 'PH12-test' })]) });
  assert.equal(result.status, 1);
  assert.deepEqual(result.questions, []);
  assert.deepEqual(result.audit.questions[0].metadata.media, media);
  assert.equal(result.audit.questions[0].question.explanation, valid().explanation);
});

test('IMPORT CLI: unsupported HSC paths are explicit partial-coverage failures', () => {
  const result = run({ [bankPath]: bank([valid()]), 'subjects/biology/year11/fa1-synthetic/question-bank-data.js': bank([valid({ id: 'biology' })]) });
  assert.equal(result.status, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(result.audit.summary.unsupportedHscFiles, 1);
  assert.equal(result.audit.skippedFiles[0].hscLayoutNeedsReview, true);
});

test('IMPORT CLI: malformed containers and parse errors do not produce a clean import', () => {
  for (const source of ['window.HSCQuestionBankData = [];', 'window.HSCQuestionBankData.lesson = null;', 'window.HSCQuestionBankData.lesson = {questions: {}};', 'syntax !! error']) {
    const result = run({ [bankPath]: source });
    assert.equal(result.status, 1);
    assert.ok(result.audit.summary.fileErrors > 0, result.stdout);
  }
});

test('IMPORT CLI: duplicate trimmed IDs fail with a diagnostic and deterministic first winner', () => {
  const result = run({ [bankPath]: bank([valid(), valid({ id: ' synthetic-q1 ', prompt: 'Duplicate source record' })]) });
  assert.equal(result.status, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(result.audit.summary.duplicateIds, 1);
  assert.ok(result.audit.questions[1].reasons.includes('duplicate-id'));
});

test('IMPORT CLI: review row errors preserve source indices and valid review questions', () => {
  const result = run({ 'subjects/physics/year12/module5/lesson.review.json': JSON.stringify({ lessonId: 'synthetic-lesson', questions: [{ type: 'short', prompt: 'Skip this' }, null, valid({ id: undefined })] }) });
  assert.equal(result.status, 1);
  assert.equal(result.questions[0].id, 'synthetic-lesson-review-3');
  assert.deepEqual(result.audit.questions.map((q) => q.sourceIndex), [1, 2]);
});

test('IMPORT CLI: malformed legacy containers remain errors alongside a valid bank', () => {
  for (const value of ['null', 'false', '42', '[]']) {
    const result = run({ [bankPath]: bank([valid()]), 'subjects/physics/year12/module6/question-bank-data.js': `const lessonQuestionBanks = ${value};` });
    assert.equal(result.status, 1);
    assert.equal(result.questions.length, 1);
    assert.equal(result.audit.summary.fileErrors, 1);
  }
});

test('IMPORT CLI: invalid cyclic rows and object IDs leave complete serializable diagnostics', () => {
  const result = run({ [bankPath]: `const cyclic = []; cyclic.push(cyclic, 'Second'); window.HSCQuestionBankData.lesson = {questions: [${JSON.stringify(valid())}, {id: 'cyclic', prompt: 'Synthetic cyclic choices', options: cyclic, correctIndex: 0}, ${JSON.stringify(valid({ id: { accidental: 'object' } }))}]};` });
  assert.equal(result.status, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(result.audit.summary.quarantined, 2);
  assert.equal(result.audit.questions[1].question.options[0].unavailable, 'circular-reference');
  assert.ok(result.audit.questions[2].reasons.includes('invalid-id'));
});
