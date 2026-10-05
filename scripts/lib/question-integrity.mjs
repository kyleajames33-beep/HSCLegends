// Offline import checks. These do not establish scientific or syllabus accuracy.
const SCAFFOLD_STEM = /^\s*(?:Question\s+\d+\s+for\s+Lesson\s+\d+\b|Sample\s+question\s+\d+\b|Quiz\s+question\s+\d+\b)/i;
const BARE_OPTION = /^\s*(?:Option\s+[A-D]|[A-D])\s*$/;
const PLACEHOLDER_EXPLANATION = /^\s*(?:explanation(?:\s+for\s+(?:quiz\s+)?question\s+\d+)?|todo|tbd|n\/?a)\s*[.!]?\s*$/i;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Retain JSON metadata as data only. No URLs or assets are fetched or rendered.
function copyMetadata(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('not JSON metadata');
  ancestors.add(value);
  let copied;
  if (Array.isArray(value)) copied = Array.from(value, (item) => copyMetadata(item, ancestors));
  else copied = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyMetadata(item, ancestors)]));
  ancestors.delete(value);
  return copied;
}

// Diagnostic copies must remain serializable even when rejected source data is not.
export function diagnosticValue(value, ancestors = new Set(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') return { unavailable: `non-JSON-${typeof value}`, display: String(value) };
  if (ancestors.has(value)) return { unavailable: 'circular-reference' };
  if (depth >= 40) return { unavailable: 'diagnostic-depth-limit' };
  ancestors.add(value);
  const next = (item) => diagnosticValue(item, ancestors, depth + 1);
  const copied = Array.isArray(value) ? Array.from(value, next)
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, next(item)]));
  ancestors.delete(value);
  return copied;
}

export function coerceQuestion(raw) {
  if (!isRecord(raw)) return { stem: undefined, options: undefined, correctIndex: undefined, reasons: ['question-not-object'] };
  const invalidId = raw.id != null && typeof raw.id !== 'string' && !(typeof raw.id === 'number' && Number.isFinite(raw.id));
  const stem = raw.prompt ?? raw.text ?? raw.question ?? raw.stem;
  const keys = isRecord(raw.options) ? Object.keys(raw.options).sort() : null;
  const options = keys ? keys.map((key) => raw.options[key]) : raw.options;
  const answers = [];
  const reasons = invalidId ? ['invalid-id'] : [];
  const labels = keys?.map((key) => key.toUpperCase());
  if (labels && new Set(labels).size !== labels.length) reasons.push('ambiguous-option-labels');
  const letterIndex = (value) => {
    const label = value.trim().toUpperCase();
    return /^[A-Z]$/.test(label)
      ? keys ? labels.indexOf(label) : label.charCodeAt(0) - 65 : NaN;
  };
  for (const field of ['correctIndex', 'correct', 'answer']) {
    if (Object.hasOwn(raw, field)) {
      if (typeof raw[field] === 'number') answers.push(raw[field]);
      // The pinned source renderer supports letter-valued `correct` on array
      // banks and `answer` on legacy A/B/C/D option maps. Never parse numeric
      // strings or arbitrary text as indices, and still compare every key.
      else if (((field === 'answer' && keys) || (field === 'correct' && Array.isArray(raw.options))) && typeof raw[field] === 'string' && /^[A-Z]$/i.test(raw[field].trim())) answers.push(letterIndex(raw[field]));
      else reasons.push(`invalid-${field}`);
    }
  }
  if (Object.hasOwn(raw, 'correctAnswer')) {
    if (typeof raw.correctAnswer !== 'string' || !raw.correctAnswer.trim()) reasons.push('invalid-correctAnswer');
    else {
      const label = raw.correctAnswer.trim().toUpperCase();
      answers.push(keys ? keys.findIndex((key) => key.toUpperCase() === label)
        : /^[A-Z]$/.test(label) ? label.charCodeAt(0) - 65
          : /^\d+$/.test(label) ? Number(label) : NaN);
    }
  }
  if (answers.length > 1 && answers.some((answer) => answer !== answers[0])) reasons.push('conflicting-answer-keys');
  return { stem, options, correctIndex: answers[0], reasons };
}

export function assessQuestion(raw) {
  const { stem, options, correctIndex, reasons } = coerceQuestion(raw);
  if (typeof stem !== 'string' || !stem.trim()) reasons.push('invalid-stem');
  if (!Array.isArray(options) || options.length < 2) reasons.push('invalid-options');
  else {
    if (Array.from(options).some((option) => typeof option !== 'string' || !option.trim())) reasons.push('invalid-option-text');
    if (options.every((option) => typeof option === 'string') && new Set(options.map((option) => option.trim())).size !== options.length) reasons.push('duplicate-options');
    if (options.every((option) => typeof option === 'string' && BARE_OPTION.test(option))) reasons.push('label-only-options');
  }
  if (!Number.isInteger(correctIndex) || !Array.isArray(options) || correctIndex < 0 || correctIndex >= options.length) reasons.push('invalid-answer-index');
  if (typeof stem === 'string' && SCAFFOLD_STEM.test(stem)) reasons.push('scaffold-stem');
  if (isRecord(raw) && raw.excluded === true) reasons.push('source-excluded');

  const metadata = {};
  for (const key of ['media', 'syllabusPoint', 'syllabusTier', 'difficulty', 'bloom', 'band', 'dotPoint', 'dotpoint']) {
    if (isRecord(raw) && Object.hasOwn(raw, key)) {
      try { metadata[key] = copyMetadata(raw[key]); }
      catch { reasons.push(`invalid-${key}-metadata`); }
    }
  }
  if (metadata.syllabusPoint !== undefined && metadata.syllabusPoint !== null && typeof metadata.syllabusPoint !== 'string') reasons.push('unsupported-syllabusPoint-shape');
  // Legends' current text-only question contract cannot preserve a visual dependency.
  // Even an empty object is ambiguous, so only absent/null media is eligible here.
  if (metadata.media !== undefined && metadata.media !== null) reasons.push('media-needs-supported-renderer');
  const explanation = typeof raw?.explanation === 'string' ? raw.explanation : '';
  const explanationStatus = !explanation.trim() ? 'missing'
    : PLACEHOLDER_EXPLANATION.test(explanation) ? 'placeholder' : 'present';
  return {
    stem, options, correctIndex, explanation, metadata,
    reasons: [...new Set(reasons)],
    explanationStatus,
    // Presence is deliberately separate from correctness and human review.
    contentReview: 'not-assessed',
  };
}
