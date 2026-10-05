// Path identity only. A filename does not establish syllabus equivalence or review.
const SUBJECTS = new Map([
  ['biology', 'biology'], ['chemistry', 'chemistry'], ['physics', 'physics'],
  ['maths-standard', 'maths-standard'], ['maths-advanced', 'maths-advanced'],
  ['maths-advanced/extension1', 'maths-ext1'],
]);

export function identifySourceCurriculum(relPath, curriculumMap = null) {
  const parts = relPath.split('/');
  const yearIndex = parts.findIndex((part, i) => i > 1 && /^year(?:11|12)$/.test(part));
  if (parts[0] !== 'subjects' || yearIndex < 0) {
    return { meta: null, hscLayoutNeedsReview: false, reason: 'outside-senior-year-scope' };
  }
  const courseDirectory = parts.slice(1, yearIndex).join('/');
  const sourceYear = Number(parts[yearIndex].slice(4));
  const unitDirectory = parts[yearIndex + 1] ?? null;
  const sourceUnitPath = parts.slice(1, -1).join('/');
  const subject = SUBJECTS.get(courseDirectory) ?? null;
  // Match the entire course directory. A prefix match mislabels extension2 as
  // maths-advanced and can also absorb archived or unknown nested courses.
  const moduleMatch = unitDirectory?.match(/^module([1-9]\d*)$/);
  const directUnitFile = parts.length === yearIndex + 3;
  const meta = subject && moduleMatch && directUnitFile
    ? { subject, year: sourceYear, module: `module-${Number(moduleMatch[1])}` } : null;
  const unitKind = /^fa\d+-/.test(unitDirectory ?? '') ? 'focus-area'
    : moduleMatch ? 'module' : 'named-or-unknown-unit';
  const reason = meta ? null : !subject ? 'unsupported-course-identity'
    : !directUnitFile ? 'unsupported-nested-source-layout' : 'curriculum-mapping-required';
  const mapPath = parts.slice(2, -1).join('/');
  const matches = Array.isArray(curriculumMap?.modules)
    ? curriculumMap.modules.filter((unit) => unit?.path === mapPath) : [];
  const matched = matches.length === 1 ? matches[0] : null;
  return {
    meta, reason, hscLayoutNeedsReview: !meta,
    identity: {
      courseDirectory, sourceYear, sourceUnitPath, unitDirectory, unitKind,
      targetSubject: meta?.subject ?? null, targetModule: meta?.module ?? null,
      mappingStatus: meta ? 'legacy-module-path-only' : 'blocked-pending-reviewed-identity',
      curriculumMap: {
        file: `subjects/${parts[1]}/curriculum-map.json`,
        status: !curriculumMap ? 'not-supplied' : matches.length > 1 ? 'ambiguous-unit-entries'
          : matched ? 'exact-source-unit-match' : 'no-exact-source-unit-match',
        unit: matched ? {
          path: matched.path, label: matched.label ?? null, name: matched.name ?? null,
          outcome: matched.outcome ?? null,
          lessonCount: Array.isArray(matched.lessons) ? matched.lessons.length : null,
        } : null,
      },
      requiredDecision: meta
        ? 'Verify curriculum version and consumer coverage before release; a legacy module path is not curriculum approval.'
        : 'Retain the source course, year and unit identity. Establish a reviewed target identifier and compatible selectors/UI before import; do not alias focus areas or other courses to legacy module numbers.',
    },
  };
}
