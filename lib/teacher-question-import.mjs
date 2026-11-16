import { assessQuestion } from '../scripts/lib/question-integrity.mjs';

export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_QUESTIONS = 20;
const subjects = new Set(['biology', 'chemistry', 'physics', 'maths-standard', 'maths-advanced', 'maths-ext1']);
const keys = new Set(['id', 'stem', 'options', 'correctIndex', 'explanation', 'subject', 'year', 'module', 'syllabusVersion', 'source']);
const csvKeys = ['id', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f', 'answer', 'explanation', 'subject', 'year', 'module', 'syllabus_version', 'source'];
const csvRequired = ['stem', 'option_a', 'option_b', 'answer', 'explanation', 'subject', 'year', 'module', 'syllabus_version', 'source'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const explanations = {
  'invalid-stem': 'Add a question.', 'invalid-options': 'Add at least two answers.',
  'invalid-option-text': 'Answer choices cannot be blank or skip a letter.', 'duplicate-options': 'Answer choices must be distinct.',
  'label-only-options': 'Write the actual answers, not just A, B or C.', 'invalid-answer-index': 'Choose a correct answer that exists.',
  'invalid-correctIndex': 'The correct answer index must be a number.', 'scaffold-stem': 'Replace the placeholder question.',
  'inline-media-needs-supported-renderer': 'Images and embedded media are not supported in this draft.',
  'figure-reference-needs-review': 'This question refers to a figure that the draft cannot include.',
  'explanation-visual-needs-supported-renderer': 'The explanation refers to media that the draft cannot include.',
  'media-needs-supported-renderer': 'Images and embedded media are not supported in this draft.',
};

// Small strict CSV reader: quoted commas/newlines and doubled quotes are
// supported. Malformed or ambiguous files fail instead of shifting answers.
function csvRows(input) {
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') { if (input[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field); field = ''; closed = false;
      if (char !== ',') { if (char === '\r' && input[i + 1] === '\n') i++; rows.push(row); row = []; }
    } else if (char === '"') {
      if (field || closed) throw new Error('Invalid CSV quote. Quote a complete field and double any quotes inside it.');
      quoted = true;
    } else {
      if (closed) throw new Error('Unexpected characters after a quoted CSV field.');
      field += char;
    }
  }
  if (quoted) throw new Error('A quoted CSV field was not closed.');
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  while (rows.length && rows.at(-1).every(value => !value.trim())) rows.pop();
  return rows;
}

function fromCsv(text) {
  const rows = csvRows(text.replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('The CSV file is empty.');
  const header = rows.shift().map(value => value.trim().toLowerCase());
  if (new Set(header).size !== header.length || header.some(value => !csvKeys.includes(value)) || csvRequired.some(value => !header.includes(value))) {
    throw new Error(`CSV headers must include ${csvRequired.join(', ')}; duplicate or unsupported headers are not accepted.`);
  }
  if (rows.length > MAX_IMPORT_QUESTIONS) throw new Error(`A draft can contain at most ${MAX_IMPORT_QUESTIONS} questions.`);
  return rows.map((row, index) => {
    if (row.length !== header.length) throw new Error(`CSV record ${index + 2} has ${row.length} fields; expected ${header.length}.`);
    const item = Object.fromEntries(header.map((name, i) => [name, row[i]]));
    const options = ['a', 'b', 'c', 'd', 'e', 'f'].map(letter => (item[`option_${letter}`] ?? '').trim());
    while (options.length && !options.at(-1)) options.pop();
    const answer = item.answer.trim().toUpperCase();
    return { id: item.id?.trim() || `draft-${index + 1}`, stem: item.stem, options, correctIndex: /^[A-F]$/.test(answer) ? answer.charCodeAt(0) - 65 : null,
      explanation: item.explanation, subject: item.subject, year: item.year, module: item.module, syllabusVersion: item.syllabus_version, source: item.source };
  });
}

function fromJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('The JSON file could not be parsed.'); }
  if (object(parsed) && parsed.format === 'hsc-legends-question-draft' && parsed.version === 1) {
    if (Object.keys(parsed).some(key => !['format', 'version', 'reviewStatus', 'questions'].includes(key))) throw new Error('This draft has unsupported fields that cannot be preserved.');
    parsed = parsed.questions;
  }
  if (!Array.isArray(parsed)) throw new Error('JSON must be an array of questions or an HSC Legends question draft.');
  if (parsed.length > MAX_IMPORT_QUESTIONS) throw new Error(`A draft can contain at most ${MAX_IMPORT_QUESTIONS} questions.`);
  return parsed;
}

/** Structural checks only: this is not an educator or syllabus approval. */
export function validateTeacherQuestions(text, format) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error('File is too large. Choose a file under 1 MB.');
  const rows = format === 'csv' ? fromCsv(text) : format === 'json' ? fromJson(text) : (() => { throw new Error('Choose a CSV or JSON file.'); })();
  if (!rows.length) throw new Error('The file contains no questions.');
  const ids = new Set(), stems = new Set();
  const results = rows.map((raw, index) => {
    if (!object(raw)) return { row: index + 1, question: null, errors: ['Question must be an object.'] };
    const errors = [], unknown = Object.keys(raw).filter(key => !keys.has(key));
    if (unknown.length) errors.push(`Unsupported fields: ${unknown.join(', ')}.`);
    const checked = assessQuestion(raw);
    if (!Array.isArray(raw.options)) errors.push('Answer choices must be an array.');
    errors.push(...checked.reasons.map(reason => explanations[reason] ?? `Check this question: ${reason}.`));
    if (checked.explanationStatus !== 'present') errors.push('Add a meaningful explanation.');
    const id = raw.id == null || raw.id === '' ? `draft-${index + 1}` : typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id || id.length > 100 || ids.has(id)) errors.push('Question ID must be unique and at most 100 characters.');
    ids.add(id);
    const stem = typeof checked.stem === 'string' ? checked.stem.trim() : '';
    const stemKey = stem.normalize('NFC').replace(/\s+/gu, ' ');
    if (stem && stems.has(stemKey)) errors.push('This question is duplicated in the file.');
    if (stem) stems.add(stemKey);
    if (stem.length > 1024) errors.push('Question text exceeds 1,024 characters.');
    if (!Array.isArray(checked.options) || checked.options.length > 6 || checked.options.some(option => typeof option !== 'string' || option.length > 256)) errors.push('Use 2–6 answers, each at most 256 characters.');
    if (typeof checked.explanation !== 'string' || checked.explanation.length > 2000) errors.push('Explanation must be at most 2,000 characters.');
    const subject = typeof raw.subject === 'string' ? raw.subject.trim().toLowerCase() : '';
    if (!subjects.has(subject)) errors.push('Choose a supported subject ID.');
    const year = typeof raw.year === 'number' ? raw.year : typeof raw.year === 'string' && /^(11|12)$/.test(raw.year.trim()) ? Number(raw.year.trim()) : null;
    if (year !== 11 && year !== 12) errors.push('Year must be 11 or 12.');
    const requiredText = (value, label, limit) => {
      const result = typeof value === 'string' ? value.trim() : '';
      if (!result || result.length > limit) errors.push(`${label} is required and must be at most ${limit} characters.`);
      return result;
    };
    const moduleName = requiredText(raw.module, 'Module', 100);
    const syllabusVersion = requiredText(raw.syllabusVersion, 'Syllabus version', 100);
    const source = requiredText(raw.source, 'Source', 200);
    const question = errors.length ? null : { id, stem, options: checked.options.map(value => value.trim()), correctIndex: checked.correctIndex, explanation: checked.explanation.trim(), subject, year, module: moduleName, syllabusVersion, source };
    return { row: index + 1, question, errors };
  });
  const valid = results.every(result => result.errors.length === 0);
  return { results, valid, draft: valid ? { format: 'hsc-legends-question-draft', version: 1, reviewStatus: 'unreviewed', questions: results.map(result => result.question) } : null };
}
