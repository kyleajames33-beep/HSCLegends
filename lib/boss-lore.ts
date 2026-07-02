import type { Subject } from './questions';

// Per-subject boss identity: a name, a title, and taunts. Pure flavour — gives
// each Campaign boss a character instead of "<Subject> boss".
export type BossLore = { name: string; title: string; taunts: string[] };

const LORE: Partial<Record<Subject, BossLore>> = {
  biology: {
    name: 'The Mitochondrion Monarch',
    title: 'Powerhouse of the Cell',
    taunts: ['Respire THIS!', 'You can’t ATP your way out!', 'Feel the Krebs cycle!'],
  },
  chemistry: {
    name: 'The Catalyst',
    title: 'Lord of Reactions',
    taunts: ['React to this!', 'Your bonds will BREAK!', 'I’ll raise your activation energy!'],
  },
  physics: {
    name: 'The Singularity',
    title: 'Bender of Spacetime',
    taunts: ['Resistance is futile — and measured in ohms!', 'Feel my momentum!', 'No escape velocity for you!'],
  },
  'maths-standard': {
    name: 'The Variable Voidwalker',
    title: 'Keeper of Unknowns',
    taunts: ['Solve for X… if you DARE!', 'Your logic is undefined!', 'I’ll divide your hopes by zero!'],
  },
  'maths-advanced': {
    name: 'The Differentiator',
    title: 'Master of Change',
    taunts: ['I’ll find your rate of failure!', 'Approach your limit!', 'dy/dx = doom!'],
  },
  'maths-ext1': {
    name: 'The Inductor',
    title: 'Proof Incarnate',
    taunts: ['Prove me wrong — you can’t!', 'Base case: you lose!', 'By induction… defeat!'],
  },
};

const FALLBACK: BossLore = {
  name: 'The Examiner',
  title: 'Final Boss',
  taunts: ['Is that all?', 'Try harder!', 'You’ll never pass!'],
};

export function bossLore(subject: Subject): BossLore {
  return LORE[subject] ?? FALLBACK;
}
