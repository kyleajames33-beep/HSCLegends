import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkSeedInput, planSeedBatches } from '../../scripts/lib/seed-preflight.mjs';

const row = { id: 'fixture-1', subject: 'physics', year: 12, module: 'module-5', stem: 'Synthetic fixture', options: ['A', 'B'], correctIndex: 0, contentReview: 'not-assessed', explanationStatus: 'present' };
const json = JSON.stringify([row]);
function auditFor(input = json) {
  return { schemaVersion: 2, questionsSha256: createHash('sha256').update(input).digest('hex'),
    summary: { emitted: 1, quarantined: 0, duplicateIds: 0, fileErrors: 0, blockedCurriculumQuestions: 0, unsupportedHscFiles: 0 },
    invalid: [], duplicateIds: [], fileErrors: [], unsupportedQuestions: [], skippedFiles: [],
    questions: [{ id: row.id, metadata: {}, reasons: [], curriculumIdentity: { targetSubject: row.subject, targetModule: row.module, sourceYear: row.year, mappingStatus: 'legacy-module-path-only', curriculumMap: { status: 'not-supplied' } } }] };
}

test('known source tier metadata is rejected whether retained in rows or audit', () => {
  assert.throws(() => checkSeedInput(JSON.stringify([{ ...row, syllabusTier: 'extension' }]), null), /syllabusTier/);
  const audit = auditFor(); audit.questions[0].metadata.syllabusTier = 'extension';
  assert.throws(() => checkSeedInput(json, audit), /syllabusTier/);
  audit.questions[0].metadata.syllabusTier = 'core';
  assert.throws(() => checkSeedInput(json, audit), /syllabusTier/);
});

test('normalizer outputs require an exact matching audit and fail on incomplete imports', () => {
  assert.throws(() => checkSeedInput(json), /requires its matching audit/);
  assert.throws(() => checkSeedInput(json, { ...auditFor(), questionsSha256: 'mismatch' }), /does not match/);
  for (const key of ['quarantined','duplicateIds','fileErrors','blockedCurriculumQuestions','unsupportedHscFiles']) {
    const audit = auditFor(); audit.summary[key] = 1;
    assert.throws(() => checkSeedInput(json, audit), /blocked import/, key);
  }
  const incomplete = auditFor(); incomplete.unsupportedQuestions.push({ id: 'blocked' });
  assert.throws(() => checkSeedInput(json, incomplete), /blocked audit/);
});

test('mismatched or unsupported curriculum identities fail closed', () => {
  for (const [key, value] of [['targetSubject','chemistry'], ['targetModule','module-6'], ['sourceYear',11], ['mappingStatus','blocked-pending-reviewed-identity']]) {
    const audit = auditFor(); audit.questions[0].curriculumIdentity[key] = value;
    assert.throws(() => checkSeedInput(json, audit), /curriculum identity/, key);
  }
});

test('clean compatible legacy inputs still work with explicit review warning', () => {
  const normalized = checkSeedInput(json, auditFor());
  assert.deepEqual(normalized.rows, [row]);
  assert.match(normalized.warnings[0], /not reviewed/);
  const { contentReview, explanationStatus, ...legacy } = row;
  assert.equal(contentReview, 'not-assessed'); assert.equal(explanationStatus, 'present');
  const unaudited = checkSeedInput(JSON.stringify([legacy]));
  assert.deepEqual(unaudited.rows, [legacy]);
  assert.match(unaudited.warnings[0], /unknown/);
});

test('SQL batch planning preserves existing files and rejects invalid sizes', () => {
  assert.equal(planSeedBatches(801, 800, ['keep.txt']), 2);
  assert.throws(() => planSeedBatches(1, 800, ['batch-00.sql']), /existing/);
  assert.throws(() => planSeedBatches(1, 800, ['batch-99.sql']), /existing/);
  for (const batch of [0, -1, Infinity, 1.5]) assert.throws(() => planSeedBatches(1, batch, []), /invalid batch/);
});
