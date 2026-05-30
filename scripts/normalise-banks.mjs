// P0-3 — Question-bank normaliser
// Reads HSC Schema-A banks (window.HSCQuestionBankData[...] = {...}) from a
// cloned Teaching-APP checkout and emits one normalised questions.json.
//
// Usage: node scripts/normalise-banks.mjs [path-to-Teaching-APP] [out-file]
// Strategy: execute each file in a sandboxed fake-`window` context (node:vm).
// This parses BOTH the JSON-style compact files and the JS-style files
// (single quotes, comments, trailing commas) without bespoke parsing.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
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
  const yearM = relPath.match(/year(\d+)/);
  const modM = relPath.match(/module(\d+)/);
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
  const sandbox = { window: { HSCQuestionBankData: {} }, __CAP__: {} };
  vm.createContext(sandbox);
  const capture =
    "\n;__CAP__.win = (typeof window!=='undefined' && window.HSCQuestionBankData) || null;" +
    "\n__CAP__.lqb = (typeof lessonQuestionBanks!=='undefined') ? lessonQuestionBanks : null;";
  try {
    new vm.Script(code + capture, { filename: full }).runInContext(sandbox, { timeout: 5000 });
  } catch (err) {
    return { error: err.message, data: {} };
  }
  // Merge both containers, keyed by lessonId.
  const data = { ...(sandbox.__CAP__.win || {}), ...(sandbox.__CAP__.lqb || {}) };
  return { error: null, data };
}

function isVariant(q) {
  return q.generated === true || /-v\d*$/.test(String(q.id || ''));
}

// Coerce one raw question (any HSC schema) into {stem, options[], correctIndex}.
//  A:  {prompt,   options:[...],       correctIndex}
//  A': {text,     options:{A,B,C,D},   correctAnswer:'C'}
//  A": {question, options:[...],       answer: 1}
function coerce(q) {
  const stem = q.prompt ?? q.text ?? q.question ?? q.stem ?? '';
  let options = q.options;
  let keys = null;
  if (options && !Array.isArray(options) && typeof options === 'object') {
    keys = Object.keys(options).sort(); // A,B,C,D
    options = keys.map((k) => options[k]);
  }
  let correctIndex;
  if (typeof q.correctIndex === 'number') correctIndex = q.correctIndex;
  else if (typeof q.correct === 'number') correctIndex = q.correct; // review.json (Schema D)
  else if (typeof q.answer === 'number') correctIndex = q.answer;
  else if (typeof q.correctAnswer === 'string') {
    const L = q.correctAnswer.trim().toUpperCase();
    if (keys) correctIndex = keys.indexOf(L);
    else if (/^[A-Z]$/.test(L)) correctIndex = L.charCodeAt(0) - 65;
    else correctIndex = Number(q.correctAnswer);
  }
  return { stem, options, correctIndex };
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
const stats = {}; // key: `${subject} y${year}` -> {original, variant}
let recovered = 0; // review questions that needed LaTeX recovery

// Shared ingest for both sources. `raw` is one source question object.
function ingest(raw, meta, lessonId, rel, source, idx) {
  const qid = raw.id && String(raw.id).trim() ? String(raw.id) : `${lessonId}-${source}-${idx + 1}`;
  let { stem, options, correctIndex } = coerce(raw);

  const reasons = [];
  if (!stem || !String(stem).trim()) reasons.push('empty stem');
  if (!Array.isArray(options) || options.length < 2) reasons.push('bad options');
  if (typeof correctIndex !== 'number' || !Array.isArray(options) || correctIndex < 0 || correctIndex >= options.length)
    reasons.push('correctIndex out of range');
  if (reasons.length) {
    invalid.push({ id: qid, file: rel, reasons });
    return;
  }
  if (seenIds.has(qid)) {
    dupes.push(qid);
    return;
  }
  seenIds.add(qid);

  // LaTeX recovery applies to ANY source — Schema A" (Ext1 Y12) and review.json
  // were both authored with lossy single-backslash escapes. No-op on clean text.
  let explanation = raw.explanation ? String(raw.explanation) : '';
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
    syllabusPoint: null,
  });

  const k = `${meta.subject} y${meta.year}`;
  stats[k] ||= { original: 0, variant: 0 };
  stats[k][quality]++;
}

// Pass 1 — question-bank-data.js (Schemas A / A' / A")
for (const full of findBanks(path.join(REPO, 'subjects'))) {
  const rel = path.relative(REPO, full);
  const meta = classify(rel);
  if (!meta) continue;
  const { error, data } = loadFile(full);
  if (error) {
    fileErrors.push({ file: rel, error });
    continue;
  }
  for (const lessonId of Object.keys(data)) {
    const lesson = data[lessonId];
    const questions = Array.isArray(lesson) ? lesson : (lesson && lesson.questions) || [];
    questions.forEach((q, idx) => ingest(q, meta, lessonId, rel, 'question-bank', idx));
  }
}

// Pass 2 — *.review.json (Schema D: per-lesson review questions)
function findReviews(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findReviews(full, acc);
    else if (e.name.endsWith('.review.json')) acc.push(full);
  }
  return acc;
}
for (const full of findReviews(path.join(REPO, 'subjects'))) {
  const rel = path.relative(REPO, full);
  const meta = classify(rel);
  if (!meta) continue;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    fileErrors.push({ file: rel, error: err.message });
    continue;
  }
  const lessonId = data.lessonId || rel;
  const questions = (data.questions || []).filter((q) => !q.type || q.type === 'mc');
  questions.forEach((q, idx) => ingest(q, meta, lessonId, rel, 'review', idx));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 0));

// --- Report ---
const totalOrig = out.filter((q) => q.quality === 'original').length;
const totalVar = out.length - totalOrig;
const fromQB = out.filter((q) => q.source === 'question-bank').length;
const fromReview = out.length - fromQB;
console.log('\n=== NORMALISE REPORT ===');
console.log(`Questions written:   ${out.length}  (original ${totalOrig} / variant ${totalVar})`);
console.log(`  by source:         question-bank ${fromQB} / review.json ${fromReview}`);
console.log(`  LaTeX recovered:   ${recovered} review questions had mangled escapes repaired`);
console.log(`Invalid skipped:     ${invalid.length}  (incl. short-answer / non-MC)`);
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
