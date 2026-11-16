import { createHash } from 'node:crypto';

// This checks for known data loss and incomplete importer output. It does not
// establish scientific correctness, syllabus approval, target permissions or
// that it is appropriate to publish anything to any database.
const sha256 = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function containsTier(value) {
  if (Array.isArray(value)) return value.some(containsTier);
  if (!object(value)) return false;
  return Object.entries(value).some(([key, child]) => (key === 'syllabusTier' && child !== null && child !== undefined) || containsTier(child));
}
export function checkSeedInput(input, audit = null) {
  if (typeof input !== 'string') throw new Error('SEED_PREFLIGHT: input must be JSON text');
  let rows;
  try { rows = JSON.parse(input); } catch { throw new Error('SEED_PREFLIGHT: invalid question JSON'); }
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every(object)) throw new Error('SEED_PREFLIGHT: expected a non-empty array of question objects');
  if (containsTier(rows)) throw new Error('SEED_PREFLIGHT: syllabusTier metadata cannot be preserved by this seed schema');
  const ids = new Set();
  for (const row of rows) {
    if (typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id)) throw new Error('SEED_PREFLIGHT: missing or duplicate question id');
    ids.add(row.id);
  }
  // Current normalizer rows carry these markers; their audit is required so
  // metadata stripped from the normalized row cannot be silently dropped.
  if (!audit) {
    if (rows.some(row => Object.hasOwn(row, 'contentReview') || Object.hasOwn(row, 'explanationStatus'))) throw new Error('SEED_PREFLIGHT: normalized input requires its matching audit sidecar');
    return { rows, warnings: ['Legacy input has no audit sidecar; source identity and omitted metadata are unknown.'] };
  }
  if (!object(audit) || audit.schemaVersion !== 2 || !object(audit.summary) || !Array.isArray(audit.questions)) throw new Error('SEED_PREFLIGHT: malformed or unsupported audit sidecar');
  if (audit.questionsSha256 !== sha256(input)) throw new Error('SEED_PREFLIGHT: audit does not match the exact question file; regenerate both');
  if (containsTier(audit.questions) || containsTier(audit.unsupportedQuestions)) throw new Error('SEED_PREFLIGHT: audit contains syllabusTier metadata that this seed schema cannot preserve');
  const summary = audit.summary;
  for (const name of ['quarantined','duplicateIds','fileErrors','blockedCurriculumQuestions','unsupportedHscFiles']) {
    if (!Number.isSafeInteger(summary[name]) || summary[name] !== 0) throw new Error(`SEED_PREFLIGHT: incomplete or blocked import (${name})`);
  }
  for (const name of ['invalid','duplicateIds','fileErrors','unsupportedQuestions']) {
    if (!Array.isArray(audit[name]) || audit[name].length !== 0) throw new Error(`SEED_PREFLIGHT: incomplete or blocked audit (${name})`);
  }
  if (!Array.isArray(audit.skippedFiles) || audit.skippedFiles.some(file => file?.hscLayoutNeedsReview !== false)) throw new Error('SEED_PREFLIGHT: uncertain skipped source identity');
  if (summary.emitted !== rows.length || audit.questions.length !== rows.length) throw new Error('SEED_PREFLIGHT: audit question counts do not match');
  const rowById = new Map(rows.map(row => [row.id, row]));
  const seen = new Set();
  for (const item of audit.questions) {
    if (!object(item) || !rowById.has(item.id) || seen.has(item.id) || !Array.isArray(item.reasons) || item.reasons.length) throw new Error('SEED_PREFLIGHT: invalid audit question identity');
    seen.add(item.id);
    const row = rowById.get(item.id), identity = item.curriculumIdentity;
    if (!object(identity) || !identity.targetSubject || !identity.targetModule || identity.targetSubject !== row.subject || identity.targetModule !== row.module || identity.sourceYear !== row.year || identity.mappingStatus !== 'legacy-module-path-only' || identity.curriculumMap?.status === 'ambiguous-unit-entries') throw new Error('SEED_PREFLIGHT: unsupported or mismatched curriculum identity');
  }
  return { rows, warnings: ['Legacy module paths are compatibility candidates, not reviewed syllabus mappings.'] };
}
export function planSeedBatches(count, batch, existingNames) {
  if (!Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(batch) || batch <= 0) throw new Error('SEED_PREFLIGHT: invalid batch size or row count');
  const files = Math.ceil(count / batch);
  const previous = existingNames.find(name => /^batch-\d+\.sql$/.test(name));
  if (previous) throw new Error(`SEED_PREFLIGHT: existing ${previous} could be overwritten or mistaken for this run`);
  return files;
}
