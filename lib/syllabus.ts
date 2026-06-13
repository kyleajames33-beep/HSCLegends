// NSW HSC syllabus MODULE map per subject, as a typed structure used by the
// Topic Map (/topics). The real data model groups questions by the clean
// `module` code column (module-1 … module-10) — NOT by the ultra-granular
// `topic` micro-slugs. So this file maps each subject → its ordered modules.
//
// Science module names are the verified NSW Stage 6 module titles. For sciences,
// module-1..4 = Year 11 and module-5..8 = Year 12. Maths module→name mappings
// are uncertain, so maths modules use generic "Module N" labels (year null);
// live counts and drilling still work off the code.

import type { Subject } from '@/lib/questions';

export type SyllabusModule = {
  code: string;          // clean code matching questions.module, e.g. "module-1"
  name: string;
  year: 11 | 12 | null;  // sciences: 11/12; maths: null
};

export const SUBJECT_LABELS: Record<Subject, string> = {
  biology: 'Biology',
  chemistry: 'Chemistry',
  physics: 'Physics',
  'maths-standard': 'Maths Standard',
  'maths-advanced': 'Maths Advanced',
  'maths-ext1': 'Maths Ext 1',
};

// Helper: build science module list from verified names. module-1..4 = Year 11,
// module-5..8 = Year 12.
function scienceModules(names: [string, string, string, string, string, string, string, string]): SyllabusModule[] {
  return names.map((name, i) => ({
    code: `module-${i + 1}`,
    name,
    year: (i < 4 ? 11 : 12) as 11 | 12,
  }));
}

// Helper: generic maths modules "Module 1" … "Module N", year null.
function mathsModules(count: number): SyllabusModule[] {
  return Array.from({ length: count }, (_, i) => ({
    code: `module-${i + 1}`,
    name: `Module ${i + 1}`,
    year: null,
  }));
}

const BIOLOGY = scienceModules([
  'Cells as the Basis of Life',
  'Organisation of Living Things',
  'Biological Diversity',
  'Ecosystem Dynamics',
  'Heredity',
  'Genetic Change',
  'Infectious Disease',
  'Non-infectious Disease & Disorders',
]);

const CHEMISTRY = scienceModules([
  'Properties & Structure of Matter',
  'Introduction to Quantitative Chemistry',
  'Reactive Chemistry',
  'Drivers of Reactions',
  'Equilibrium & Acid Reactions',
  'Acid/Base Reactions',
  'Organic Chemistry',
  'Applying Chemical Ideas',
]);

const PHYSICS = scienceModules([
  'Kinematics',
  'Dynamics',
  'Waves & Thermodynamics',
  'Electricity & Magnetism',
  'Advanced Mechanics',
  'Electromagnetism',
  'The Nature of Light',
  'From the Universe to the Atom',
]);

// Maths: module→name mapping uncertain. Generic labels. Maths Ext 1 can run up
// to module-10; Standard/Advanced are commonly 6 modules. We list enough generic
// modules to cover the data; modules with 0 questions render as "coming soon".
const MATHS_ADVANCED = mathsModules(6);
const MATHS_STANDARD = mathsModules(6);
const MATHS_EXT1 = mathsModules(10);

const ALL: Record<Subject, SyllabusModule[]> = {
  biology: BIOLOGY,
  chemistry: CHEMISTRY,
  physics: PHYSICS,
  'maths-advanced': MATHS_ADVANCED,
  'maths-standard': MATHS_STANDARD,
  'maths-ext1': MATHS_EXT1,
};

export function subjectModules(subjectId: Subject): SyllabusModule[] {
  return ALL[subjectId] ?? [];
}

export function moduleName(subjectId: Subject, code: string): string {
  const m = (ALL[subjectId] ?? []).find((x) => x.code === code);
  if (m) return m.name;
  // Fallback: derive "Module N" from the code.
  const n = /module-(\d+)/.exec(code)?.[1];
  return n ? `Module ${n}` : code;
}
