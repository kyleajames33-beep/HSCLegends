// P0-3 — Question-bank normaliser
// Reads HSC Schema-A banks (window.HSCQuestionBankData[...] = {...}) from a
// cloned Teaching-APP checkout and emits one normalised questions.json.
//
// Usage: node scripts/normalise-banks.mjs [path-to-Teaching-APP] [out-file]
// Trusted-checkout input only: execute each file in a fake-window node:vm context.
// node:vm is not a security sandbox. Never use untrusted uploads as input.
// This parses BOTH the JSON-style compact files and the JS-style files
// (single quotes, comments, trailing commas) without bespoke parsing.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { assessQuestion, diagnosticValue } from './lib/question-integrity.mjs';

const REPO = process.argv[2] || '/workspaces/Teaching-APP';
const OUT = process.argv[3] || path.join(process.cwd(), 'out', 'questions.json');

// --- Which subject dirs are HSC (v1). Junior maths/science are Phase 2. ---
// Maps a subjects/ sub-path prefix -> canonical subject slug.
const HSC_SUBJECTS = [
  { dir: 'biology', subject: 'biology' },
  { dir: 'chemistry', subject: 'chemistry' },
  { dir: 'physics', subject: 'physics' },
  { dir: 'maths-standard', subject: 'maths-standard' },
  { dir: 'maths-advanced/extension1', subject: 'maths-ext1' }, // must test BEFORE maths-advanced
  { dir: 'maths-advanced', subject: 'maths-advanced' },
];

const VALID_BLOOM = new Set(['remember', 'understand', 'apply', 'analyse']);

// Per-file source repairs for 2 banks with genuine JS syntax bugs in Teaching-APP.
// These are surgical and documented; the proper fix belongs upstream in that repo.
const REPAIRS = [
  {
    // LaTeX prime f'(x) was written as `\\'` (escaped backslash + terminating quote)
    // instead of `\'` (escaped apostrophe). 12 occurrences.
    match: 'maths-advanced/year11/module4/question-bank-data.js',
    fix: (c) => c.replace(/\\\\'/g, "\\'"),
  },
  {
    // Two bugs: (1) missing comma after an `explanation: '...'` before `topic:`;
    // (2) one unescaped LaTeX prime `f'(` that terminates its string early.
    match: 'maths-advanced/extension1/year11/module1/question-bank-data.js',
    fix: (c) => c.replace(/'(\s*\n\s*topic:)/g, "',$1").replace(/([A-Za-z])'(\()/g, "$1\\'$2"),
  },
];

const kebab = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general';

// Recursively collect question-bank-data.js files under subjects/.
function findBanks(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findBanks(full, acc);
    else if (e.name === 'question-bank-data.js') acc.push(full);
  }
  return acc;
}

// Classify a file path -> {subject, year, module} or null if not an HSC bank.
function classify(relPath) {
  // relPath like: subjects/maths-advanced/extension1/year11/module1/question-bank-data.js
  const after = relPath.replace(/^subjects\//, '');
  const match = HSC_SUBJECTS.find((s) => after.startsWith(s.dir + '/'));
  if (!match) return null;
  const yearM = relPath.match(/(?:^|\/)year(\d+)(?:\/|$)/);
  const modM = relPath.match(/(?:^|\/)module(\d+)(?:\/|$)/);
  if (!yearM || !modM) return null;
  const year = Number(yearM[1]);
  if (year !== 11 && year !== 12) return null; // HSC only
  return { subject: match.subject, year, module: `module-${Number(modM[1])}` };
}

// Run one file in an isolated fake-window sandbox; capture every known bank
// container — window.HSCQuestionBankData (Schema A) AND a top-level
// `const lessonQuestionBanks` (Schema A'). The capture line is appended to the
// SAME script so it can read the file's top-level const bindings.
function loadFile(full) {
  let code = fs.readFileSync(full, 'utf8');
  for (const r of REPAIRS) if (full.endsWith(r.match)) code = r.fix(code);
  let runtimeBank = {};
  let runtimeBankAssigned = false;
  const fakeWindow = {};
  Object.defineProperty(fakeWindow, 'HSCQuestionBankData', {
    enumerable: true,
    get: () => runtimeBank,
    set: (value) => { runtimeBankAssigned = true; runtimeBank = value; },
  });
  const sandbox = { window: fakeWindow, __CAP__: {} };
  vm.createContext(sandbox);
  const capture =
    "\n;__CAP__.win = (typeof window!=='undefined' && window.HSCQuestionBankData) || null;" +
    "\n__CAP__.hasLegacy = (typeof lessonQuestionBanks!=='undefined');" +
    "\n__CAP__.lqb = (typeof lessonQuestionBanks!=='undefined') ? lessonQuestionBanks : null;";
  try {
    new vm.Script(code + capture, { filename: full }).runInContext(sandbox, { timeout: 5000 });
  } catch (err) {
    return { error: err.message, data: {} };
  }
  // An explicitly published (even empty) runtime bank is authoritative, including
  // lessons it omits. A populated directly-mutated bank is also authoritative.
  // Merging legacy data back in can resurrect questions filtered by the source.
  const win = sandbox.__CAP__.win;
  const legacy = sandbox.__CAP__.hasLegacy ? sandbox.__CAP__.lqb : {};
  const hasRuntimeBank = runtimeBankAssigned || (win && Object.keys(win).length > 0);
  const data = hasRuntimeBank ? win : legacy;
  const selections = [];
  if (hasRuntimeBank && win && typeof win === 'object' && !Array.isArray(win) && legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    for (const [lessonId, lesson] of Object.entries(legacy)) {
      const rawQuestions = Array.isArray(lesson) ? lesson : lesson?.questions;
      if (!Array.isArray(rawQuestions)) continue;
      const served = Array.isArray(win[lessonId]) ? win[lessonId] : win[lessonId]?.questions || [];
      const servedIds = new Set(Array.isArray(served) ? served.map((q) => q?.id) : []);
      for (const q of rawQuestions) {
        if (q?.id != null && servedIds.has(q.id)) continue;
        const a = assessQuestion(q);
        selections.push({ lessonId, id: diagnosticValue(q?.id ?? null), reason: 'not-exposed-by-source-runtime-bank',
          question: diagnosticValue({ stem: a.stem, options: a.options, correctIndex: a.correctIndex, explanation: a.explanation }),
          metadata: a.metadata, explanationStatus: a.explanationStatus, contentReview: a.contentReview });
      }
    }
  }
  return { error: null, data, selection: { container: hasRuntimeBank ? 'window.HSCQuestionBankData' : 'lessonQuestionBanks', omittedLegacyQuestions: selections } };
}

function isVariant(q) {
  return q.generated === true || /-v\d*$/.test(String(q.id || ''));
}

// Recover LaTeX mangled by lossy JSON escaping in review.json:
// single-backslash commands (\frac, \text, \binom...) were parsed into control
// chars (formfeed/tab/backspace/CR). Re-insert the backslash. (\n left alone —
// could be a legitimate newline.) Fully-stripped commands (\cup) are unrecoverable.
function recoverLatex(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\f/g, '\\f').replace(/\t/g, '\\t').replace(/\x08/g, '\\b').replace(/\r/g, '\\r');
}
const hasCtrl = (s) => typeof s === 'string' && /[\x08\t\f\r]/.test(s);

// NESA band (1-6) -> our difficulty (1-3).
function bandToDifficulty(band) {
  if (typeof band !== 'number') return 2;
  if (band <= 3) return 1;
  if (band === 4) return 2;
  return 3;
}

// --- Run ---
const out = [];
const invalid = [];
const fileErrors = [];
const seenIds = new Set();
const dupes = [];
const skippedFiles = [];
const sourceSelections = [];
const auditQuestions = [];
const stats = {}; // key: `${subject} y${year}` -> {original, variant}
let recovered = 0; // review questions that needed LaTeX recovery

// Shared ingest for both sources. `raw` is one source question object.
function ingest(raw, meta, lessonId, rel, source, idx) {
  const sourceId = typeof raw?.id === 'string' || (typeof raw?.id === 'number' && Number.isFinite(raw.id)) ? String(raw.id).trim() : '';
  const qid = sourceId || `${lessonId}-${source}-${idx + 1}`;
  const assessment = assessQuestion(raw);
  let { stem, options, correctIndex } = assessment;
  const reasons = assessment.reasons;
  const audit = { id: qid, file: rel, lessonId, source, sourceIndex: idx,
    explanationStatus: assessment.explanationStatus, contentReview: assessment.contentReview,
    metadata: assessment.metadata, reasons };
  auditQuestions.push(audit);
  if (reasons.length) {
    // Quarantined items retain available instructional data for offline review.
    audit.question = diagnosticValue({ stem, options, correctIndex, explanation: assessment.explanation });
    invalid.push({ id: qid, file: rel, reasons });
    return;
  }
  if (seenIds.has(qid)) {
    reasons.push('duplicate-id');
    dupes.push(qid);
    return;
  }
  seenIds.add(qid);

  // LaTeX recovery applies to ANY source — Schema A" (Ext1 Y12) and review.json
  // were both authored with lossy single-backslash escapes. No-op on clean text.
  let explanation = assessment.explanation;
  if (hasCtrl(stem) || options.some(hasCtrl) || hasCtrl(explanation)) recovered++;
  stem = recoverLatex(stem);
  options = options.map(recoverLatex);
  explanation = recoverLatex(explanation);

  const quality = isVariant(raw) ? 'variant' : 'original';
  const topics = Array.isArray(raw.topics) ? raw.topics.map(kebab) : [];
  const topic = kebab(raw.topic || topics[0] || 'general');
  const difficulty = [1, 2, 3].includes(raw.difficulty) ? raw.difficulty : bandToDifficulty(raw.band);

  out.push({
    id: qid,
    subject: meta.subject,
    year: meta.year,
    module: meta.module,
    lessonId,
    topic,
    topics: topics.length ? topics : [topic],
    stem: String(stem),
    options: options.map(String),
    correctIndex,
    explanation,
    difficulty,
    bloom: VALID_BLOOM.has(raw.bloom) ? raw.bloom : 'understand',
    quality,
    source,
    syllabusPoint: assessment.metadata.syllabusPoint ?? null,
    media: assessment.metadata.media ?? null,
    explanationStatus: assessment.explanationStatus,
    contentReview: assessment.contentReview,
  });

  const k = `${meta.subject} y${meta.year}`;
  stats[k] ||= { original: 0, variant: 0 };
  stats[k][quality]++;
}

// Pass 1 — question-bank-data.js (Schemas A / A' / A")
for (const full of findBanks(path.join(REPO, 'subjects'))) {
  const rel = path.relative(REPO, full).split(path.sep).join('/');
  const meta = classify(rel);
  if (!meta) {
    skippedFiles.push({ file: rel, reason: 'outside-supported-subject-year-module-layout',
      hscLayoutNeedsReview: HSC_SUBJECTS.some((s) => rel.startsWith(`subjects/${s.dir}/`)) && /(?:^|\/)year(?:11|12)(?:\/|$)/.test(rel) });
    continue;
  }
  const { error, data, selection } = loadFile(full);
  if (error) {
    fileErrors.push({ file: rel, error });
    continue;
  }
  sourceSelections.push({ file: rel, ...selection });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fileErrors.push({ file: rel, error: 'Question bank must be a lesson-keyed object' });
    continue;
  }
  for (const lessonId of Object.keys(data).sort()) {
    const lesson = data[lessonId];
    const questions = Array.isArray(lesson) ? lesson : lesson?.questions;
    if (!Array.isArray(questions)) {
      fileErrors.push({ file: rel, error: `Question list is not an array: ${lessonId}` });
      continue;
    }
    questions.forEach((q, idx) => ingest(q, meta, lessonId, rel, 'question-bank', idx));
  }
}

// Pass 2 — *.review.json (Schema D: per-lesson review questions)
function findReviews(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findReviews(full, acc);
    else if (e.name.endsWith('.review.json')) acc.push(full);
  }
  return acc;
}
for (const full of findReviews(path.join(REPO, 'subjects'))) {
  const rel = path.relative(REPO, full).split(path.sep).join('/');
  const meta = classify(rel);
  if (!meta) {
    skippedFiles.push({ file: rel, reason: 'outside-supported-subject-year-module-layout',
      hscLayoutNeedsReview: HSC_SUBJECTS.some((s) => rel.startsWith(`subjects/${s.dir}/`)) && /(?:^|\/)year(?:11|12)(?:\/|$)/.test(rel) });
    continue;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    fileErrors.push({ file: rel, error: err.message });
    continue;
  }
  if (!data || !Array.isArray(data.questions)) {
    fileErrors.push({ file: rel, error: 'Review questions must be an array' });
    continue;
  }
  const lessonId = data.lessonId || rel;
  data.questions.forEach((q, idx) => {
    if (q?.type && q.type !== 'mc') return;
    ingest(q, meta, lessonId, rel, 'review', idx);
  });
}

const auditPath = `${OUT}.audit.json`;
const summary = { emitted: out.length, quarantined: invalid.length, duplicateIds: dupes.length,
  fileErrors: fileErrors.length, skippedFiles: skippedFiles.length,
  unsupportedHscFiles: skippedFiles.filter((file) => file.hscLayoutNeedsReview).length,
  omittedBySource: sourceSelections.reduce((sum, file) => sum + file.omittedLegacyQuestions.length, 0),
  explanationPresent: out.filter((q) => q.explanationStatus === 'present').length,
  explanationMissing: out.filter((q) => q.explanationStatus === 'missing').length,
  explanationPlaceholder: out.filter((q) => q.explanationStatus === 'placeholder').length };
const auditJSON = JSON.stringify({ schemaVersion: 1,
  scope: 'Only the supplied checkout files; not a live database or scientific review',
  summary, invalid, duplicateIds: dupes, fileErrors, skippedFiles, sourceSelections, questions: auditQuestions }, null, 2);
const questionsJSON = JSON.stringify(out);
// Serialize both before writing either. Invalid source data cannot leave an
// apparently successful new canonical file with no diagnostic artifact.
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(auditPath, auditJSON);
fs.writeFileSync(OUT, questionsJSON);

// --- Report ---
const totalOrig = out.filter((q) => q.quality === 'original').length;
const totalVar = out.length - totalOrig;
const fromQB = out.filter((q) => q.source === 'question-bank').length;
const fromReview = out.length - fromQB;
console.log('\n=== NORMALISE REPORT ===');
console.log(`Questions written:   ${out.length}  (original ${totalOrig} / variant ${totalVar})`);
console.log(`  by source:         question-bank ${fromQB} / review.json ${fromReview}`);
console.log(`  LaTeX recovered:   ${recovered} review questions had mangled escapes repaired`);
console.log(`Source-filtered:     ${summary.omittedBySource} legacy entries not exposed by their runtime bank`);
console.log(`Quarantined:         ${invalid.length}  (structural, scaffold, excluded or media-dependent)`);
console.log(`Files outside scope: ${skippedFiles.length}  (see audit; not silently counted as covered)`);
console.log(`Explanation status:  ${summary.explanationPresent} present / ${summary.explanationMissing} missing / ${summary.explanationPlaceholder} placeholder`);
console.log('Content review:      NOT ASSESSED. Explanation presence does not establish correctness.');
console.log(`Duplicate ids:       ${dupes.length}`);
console.log(`File load errors:    ${fileErrors.length}`);
console.log('\nPer subject/year (original / variant):');
for (const k of Object.keys(stats).sort()) {
  console.log(`  ${k.padEnd(20)} ${String(stats[k].original).padStart(5)} / ${stats[k].variant}`);
}
if (fileErrors.length) {
  console.log('\nFile errors:');
  fileErrors.forEach((e) => console.log(`  ${e.file}: ${e.error}`));
}
if (invalid.length) {
  console.log(`\nFirst 10 invalid: ${invalid.slice(0, 10).map((i) => i.id || '(no id)').join(', ')}`);
}
console.log(`\nWrote ${OUT}`);
console.log(`Audit: ${auditPath}`);
// A partial run still leaves diagnostic output, but cannot claim a clean import.
if (fileErrors.length || summary.unsupportedHscFiles || invalid.length || dupes.length || !out.length) process.exitCode = 1;
