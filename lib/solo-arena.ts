import { QUESTIONS, SCOPE } from '../prototypes/lab-tycoon/src/content.mjs';
import { validateTeacherQuestions } from './teacher-question-import.mjs';

export const ARENA_SCOPE = SCOPE;
export const ARENA_ROUNDS = 8;
export const ROUND_MS = 20000;
export const POWER_COST = 2;
export const MAX_ARENA_DRAFT_CHARS = 90_000;
export const ARENA_QUESTIONS = QUESTIONS.map(q => ({ id: q.id, topic: q.topic, stem: q.stem, equation: q.equation, answers: [...q.answers], answer: q.answer, explanation: q.explanation }));
export type ArenaQuestion = (typeof ARENA_QUESTIONS)[number];
export type Rival = { id: string; name: string; glyph: string; lives: number; correct: number; last: 'correct' | 'miss' | null };
export type ArenaReceipt = { questionIndex: number; picked: number | null; correct: boolean; blocked: boolean; timeout: boolean };
export type ArenaState = { phase: 'ready' | 'round' | 'reveal' | 'done'; run: number; seed: number; round: number; lives: number; energy: number; correct: number; shield: boolean; hidden: number[]; deadline: number; remaining: number; rivals: Rival[]; receipts: ArenaReceipt[]; questions: ArenaQuestion[]; customDraft: boolean };
export type ArenaAction = { type: 'start'; now: number; seed: number; draft?: string } | { type: 'answer'; run: number; round: number; choice: number; now: number } | { type: 'tick'; run: number; now: number } | { type: 'power'; run: number; round: number; power: 'shield' | 'scan'; now: number } | { type: 'next'; run: number; round: number; now: number } | { type: 'reset'; run: number };
const roster = [{ id: 'nova', name: 'Nova', glyph: '✦' }, { id: 'ion', name: 'Ion', glyph: '⚡' }, { id: 'orbit', name: 'Orbit', glyph: '◎' }, { id: 'flux', name: 'Flux', glyph: '◆' }, { id: 'quark', name: 'Quark', glyph: '⬡' }];
export function initialArena(run = 0): ArenaState { return { phase: 'ready', run, seed: 1, round: 0, lives: 3, energy: 2, correct: 0, shield: false, hidden: [], deadline: 0, remaining: ROUND_MS, rivals: roster.map(r => ({ ...r, lives: 2, correct: 0, last: null })), receipts: [], questions: ARENA_QUESTIONS, customDraft: false }; }
function random(seed: number, round: number, rival: number) { let n = (seed ^ Math.imul(round + 1, 374761393) ^ Math.imul(rival + 1, 668265263)) >>> 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
export function arenaQuestionOrder(seed: number, count = ARENA_QUESTIONS.length): number[] {
  const indices = Array.from({ length: count }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i--) {
    const target = Math.floor(random(seed, i, 7919) * (i + 1));
    [indices[i], indices[target]] = [indices[target], indices[i]];
  }
  return indices;
}
export function arenaRoundLimit(state: ArenaState): number { return Math.min(ARENA_ROUNDS, state.questions.length); }
function questionIndexFor(state: ArenaState): number { return arenaQuestionOrder(state.seed, state.questions.length)[state.round % state.questions.length]; }
export function questionFor(state: ArenaState): ArenaQuestion { return state.questions[questionIndexFor(state)]; }
export function arenaQuestionsFromDraft(raw: string): ArenaQuestion[] | null {
  try {
    if (raw.length > MAX_ARENA_DRAFT_CHARS) return null;
    const result = validateTeacherQuestions(raw, 'json');
    if (!result.valid || !result.draft) return null;
    return result.draft.questions.map(q => ({ id: q.id, topic: `${q.subject} · Year ${q.year} · ${q.module}`, stem: q.stem, equation: '', answers: [...q.options], answer: q.correctIndex, explanation: q.explanation }));
  } catch { return null; }
}
export function arenaRank(state: ArenaState) { return 1 + state.rivals.filter(r => (r.lives > 0 && state.lives === 0) || ((r.lives > 0) === (state.lives > 0) && (r.correct > state.correct || (r.correct === state.correct && r.lives > state.lives)))).length; }
export function arenaWon(state: ArenaState) { return state.lives > 0 && arenaRank(state) === 1; }
function resolveRound(state: ArenaState, choice: number | null, timeout: boolean): ArenaState {
  const correct = !timeout && choice === questionFor(state).answer;
  const blocked = !correct && state.shield;
  const rivals = state.rivals.map((r, index) => { if (r.lives === 0) return { ...r, last: null }; const hit = random(state.seed, state.round, index) < .64; return { ...r, lives: Math.max(0, r.lives - Number(!hit)), correct: r.correct + Number(hit), last: hit ? 'correct' as const : 'miss' as const }; });
  return { ...state, phase: 'reveal', remaining: timeout ? 0 : state.remaining, correct: state.correct + Number(correct), lives: Math.max(0, state.lives - Number(!correct && !blocked)), energy: Math.min(3, state.energy + Number(correct)), shield: false, rivals, receipts: [...state.receipts, { questionIndex: questionIndexFor(state), picked: choice, correct, blocked, timeout }] };
}
export function arenaReducer(state: ArenaState, action: ArenaAction): ArenaState {
  if (action.type === 'reset') return action.run === state.run ? initialArena(state.run + 1) : state;
  if (action.type === 'start') { if (state.phase !== 'ready' || !Number.isFinite(action.now) || !Number.isFinite(action.seed)) return state; const questions = action.draft === undefined ? ARENA_QUESTIONS : arenaQuestionsFromDraft(action.draft); if (!questions?.length) return state; const seed = Math.abs(Math.trunc(action.seed)) % 1000000 || 1; return { ...state, phase: 'round', run: state.run + 1, seed, questions, customDraft: action.draft !== undefined, deadline: action.now + ROUND_MS }; }
  if (action.run !== state.run || state.phase === 'ready' || state.phase === 'done') return state;
  if (action.type === 'next') { if (state.phase !== 'reveal' || action.round !== state.round || !Number.isFinite(action.now)) return state; if (state.lives === 0 || state.round + 1 >= arenaRoundLimit(state) || state.rivals.every(r => r.lives === 0)) return { ...state, phase: 'done' }; return { ...state, phase: 'round', round: state.round + 1, deadline: action.now + ROUND_MS, remaining: ROUND_MS, shield: false, hidden: [], rivals: state.rivals.map(r => ({ ...r, last: null })) }; }
  if (state.phase !== 'round' || !Number.isFinite(action.now)) return state;
  if ('round' in action && action.round !== state.round) return state;
  if (action.now >= state.deadline) return resolveRound({ ...state, remaining: 0 }, null, true);
  if (action.type === 'tick') return { ...state, remaining: Math.min(ROUND_MS, Math.max(0, state.deadline - action.now)) };
  if (action.type === 'answer') { if (!Number.isInteger(action.choice) || action.choice < 0 || action.choice >= questionFor(state).answers.length || state.hidden.includes(action.choice)) return state; return resolveRound({ ...state, remaining: state.deadline - action.now }, action.choice, false); }
  if (action.type === 'power') { if (state.energy < POWER_COST || (action.power === 'shield' && state.shield) || (action.power === 'scan' && state.hidden.length > 0)) return state; if (action.power === 'shield') return { ...state, energy: state.energy - POWER_COST, shield: true }; const hidden = questionFor(state).answers.map((_, i) => i).filter(i => i !== questionFor(state).answer).slice(0, 2); return { ...state, energy: state.energy - POWER_COST, hidden }; }
  return state;
}
