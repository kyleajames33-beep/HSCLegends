import { QUESTIONS, UPGRADES, CONTENT_REVISION } from './content.mjs';
export const CHECKPOINT_KEY = 'hsclegends.offline-equilibrium.v1';
export const UNDO_KEY = CHECKPOINT_KEY + '.undo';
export const MAX_EARNED = QUESTIONS.length * 10;
// Far below the IEEE-754 safe-integer limit, with room for a whole run.
export const MAX_BASE_REVISION = 1_000_000_000;
export const MAX_EVENTS = 100;
const validBase = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_BASE_REVISION;
function validClock(state) {
  return !!state && validBase(state.baseRevision) && Array.isArray(state.events) && state.events.length <= MAX_EVENTS && Number.isSafeInteger(state.revision) && state.revision === state.baseRevision + state.events.length;
}
const EVENT_TYPES = ['START', 'SUBMIT', 'RETRY', 'REVIEW', 'BUY', 'NEXT'];
export function createState(baseRevision = 0) {
  if(!validBase(baseRevision)) throw new RangeError('Invalid base revision.');
  return {baseRevision, revision:baseRevision, index:0, phase:'learn', records:QUESTIONS.map(() => ({attempts:[], reviewed:false})), owned:[], events:[]};
}
export function rewards(record, question) {
  const first = record.attempts[0];
  const second = record.attempts[1];
  const answer = first?.choice === question.answer ? 4 : second?.choice === question.answer ? 2 : 0;
  const reasoning = first?.reason === question.reason ? 4 : second?.reason === question.reason ? 2 : 0;
  return {answer, reasoning, review:record.reviewed ? 2 : 0, total:answer + reasoning + (record.reviewed ? 2 : 0)};
}
export function economy(state) {
  const earned = state.records.reduce((sum,r,i) => sum + rewards(r,QUESTIONS[i]).total,0);
  const spent = state.owned.reduce((sum,id) => sum + UPGRADES.find(u => u.id === id).cost,0);
  return {earned, spent, available:earned-spent};
}
export function canRetry(state) {
  const r = state.records[state.index], q = QUESTIONS[state.index];
  return state.phase === 'feedback' && r.attempts.length === 1 && (r.attempts[0].choice !== q.answer || r.attempts[0].reason !== q.reason);
}
export function canBuy(state,id) {
  const u = UPGRADES.find(item => item.id === id);
  return state.phase === 'shop' && !!u && !state.owned.includes(id) && economy(state).available >= u.cost;
}
// Every UI action carries the revision from the render that created it. Retained
// handlers and duplicate clicks are rejected by the same pure transition logic.
export function transition(state, action) {
  if (!validClock(state) || !action || action.expectedRevision !== state.revision) return state;
  if (action.type === 'RESET') return validBase(state.revision + 1) ? createState(state.revision + 1) : state;
  if(state.events.length >= MAX_EVENTS) return state;
  if (!EVENT_TYPES.includes(action.type)) return state;
  const q = QUESTIONS[state.index], r = state.records[state.index];
  let valid = false;
  switch(action.type) {
    case 'START': valid = state.phase === 'learn'; break;
    case 'SUBMIT': valid = state.phase === 'answer' && r.attempts.length < 2 && Number.isInteger(action.choice) && action.choice >= 0 && action.choice < q.answers.length && Number.isInteger(action.reason) && action.reason >= 0 && action.reason < q.reasons.length; break;
    case 'RETRY': valid = canRetry(state); break;
    case 'REVIEW': valid = state.phase === 'feedback' && !r.reviewed; break;
    case 'BUY': valid = canBuy(state,action.id); break;
    case 'NEXT': valid = state.phase === 'shop'; break;
  }
  if (!valid) return state;
  const next = structuredClone(state);
  const nr = next.records[next.index];
  switch(action.type) {
    case 'START': next.phase = 'answer'; break;
    case 'SUBMIT': nr.attempts.push({choice:action.choice,reason:action.reason}); next.phase = 'feedback'; break;
    case 'RETRY': next.phase = 'answer'; break;
    case 'REVIEW': nr.reviewed = true; next.phase = 'shop'; break;
    case 'BUY': next.owned.push(action.id); break;
    case 'NEXT': if(next.index === QUESTIONS.length - 1) next.phase = 'complete'; else {next.index++; next.phase='learn';} break;
  }
  const clean = {type:action.type, expectedRevision:state.revision};
  if(action.type === 'SUBMIT') {clean.choice=action.choice;clean.reason=action.reason;}
  if(action.type === 'BUY') clean.id=action.id;
  next.events.push(clean);
  next.revision++;
  return next;
}
export function encodeCheckpoint(state) {
  return JSON.stringify({version:1, contentRevision:CONTENT_REVISION, baseRevision:state.baseRevision, events:state.events});
}
// Replay accepted actions instead of trusting stored currency or progress fields.
// This is corruption protection, not an anti-cheat or authentication boundary.
export function decodeCheckpoint(raw) {
  try {
    if(typeof raw !== 'string' || raw.length > 50000) throw new Error('Invalid checkpoint.');
    const data = JSON.parse(raw);
    if(data.version !== 1 || data.contentRevision !== CONTENT_REVISION || !validBase(data.baseRevision) || !Array.isArray(data.events) || data.events.length > MAX_EVENTS) throw new Error('Unsupported checkpoint.');
    let state = createState(data.baseRevision);
    for(const action of data.events) {
      if(!action || !EVENT_TYPES.includes(action.type)) throw new Error('Invalid event.');
      const next = transition(state,action);
      if(next === state) throw new Error('Invalid event sequence.');
      state=next;
    }
    return {state, error:null};
  } catch { return {state:null, error:'This local checkpoint could not be read. It has not been overwritten.'}; }
}
export function readCheckpoint(storage,key=CHECKPOINT_KEY) {
  try {const raw=storage.getItem(key);return raw === null ? {state:null,error:null} : decodeCheckpoint(raw);} catch {return {state:null,error:'Browser storage is unavailable. This run stays in memory only.'};}
}
export function saveCheckpoint(storage,state,key=CHECKPOINT_KEY) {
  try {storage.setItem(key,encodeCheckpoint(state));return null;} catch {return 'Local save failed. Keep this tab open; progress is in memory only.';}
}
// Rebase a recoverable reset so old pre-reset callbacks never regain ownership.
export function restoreProgress(current, saved) {
  if(!validClock(current) || !validBase(current.revision + 1)) return current;
  let checked;
  try {checked=decodeCheckpoint(encodeCheckpoint(saved)).state;} catch {return current;}
  if(!checked) return current;
  let restored=createState(current.revision + 1);
  for(const event of checked.events) {
    const next=transition(restored,{...event,expectedRevision:restored.revision});
    if(next===restored) return current;
    restored=next;
  }
  return restored;
}
