import { CONTENT_REVISION } from '../prototypes/lab-tycoon/src/content.mjs';
import { arenaReducer, initialArena, MAX_ARENA_DRAFT_CHARS, type ArenaAction, type ArenaState } from './solo-arena';

// A local action log is replayed through the same rules rather than trusting
// stored scores, answers or rival data. It carries no account rewards.
export const ARENA_SAVE_KEY = 'hsclegends.knockout-solo.session.v1';
export const ARENA_DRAFT_KEY = 'hsclegends.knockout-solo.teacher-draft.v1';
type SavedAction = Exclude<ArenaAction, { type: 'reset' }>;
export type ArenaSession = { game: ArenaState; baseRun: number; actions: SavedAction[] | null };
export type ArenaSessionAction = ArenaAction | { type: 'resume'; raw: string; now: number };
const MAX_ACTIONS = 48;

export function initialArenaSession(): ArenaSession {
  return { game: initialArena(), baseRun: 0, actions: null };
}

export function serializeArenaSession(actions: readonly SavedAction[], baseRun: number): string {
  return JSON.stringify({ version: 2, content: CONTENT_REVISION, baseRun, actions });
}

function isSavedAction(value: unknown): value is SavedAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.now !== 'number' || !Number.isSafeInteger(row.now) || row.now < 0) return false;
  if (row.type === 'start') return typeof row.seed === 'number' && Number.isSafeInteger(row.seed) && (row.draft === undefined || (typeof row.draft === 'string' && row.draft.length <= MAX_ARENA_DRAFT_CHARS));
  if (typeof row.run !== 'number' || !Number.isSafeInteger(row.run) || row.run < 0) return false;
  if (row.type === 'tick') return true;
  if (typeof row.round !== 'number' || !Number.isSafeInteger(row.round) || row.round < 0) return false;
  if (row.type === 'next') return true;
  if (row.type === 'answer') return typeof row.choice === 'number' && Number.isSafeInteger(row.choice);
  return row.type === 'power' && (row.power === 'shield' || row.power === 'scan');
}

/** Reject corrupted, obsolete or impossible histories; no browser APIs here. */
export function restoreArenaSession(raw: string, now: number): ArenaSession | null {
  if (typeof raw !== 'string' || raw.length > 200_000 || !Number.isSafeInteger(now) || now < 0) return null;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
    const data = saved as Record<string, unknown>;
    if (data.version !== 2 || data.content !== CONTENT_REVISION || typeof data.baseRun !== 'number' || !Number.isSafeInteger(data.baseRun) || data.baseRun < 0 || data.baseRun > 1_000_000 || !Array.isArray(data.actions) || data.actions.length < 1 || data.actions.length > MAX_ACTIONS) return null;
    let game = initialArena(data.baseRun);
    const actions: SavedAction[] = [];
    for (const entry of data.actions) {
      if (!isSavedAction(entry) || entry.now > now + 1000) return null;
      // Normal ticks only update the display and are deliberately not saved.
      if (entry.type === 'tick' && (game.phase !== 'round' || entry.now < game.deadline)) return null;
      const next = arenaReducer(game, entry);
      if (next === game || (entry.type === 'tick' && next.phase !== 'reveal')) return null;
      game = next;
      actions.push(entry);
    }
    if (game.phase === 'ready') return null;
    if (game.phase === 'round') {
      const tick: SavedAction = { type: 'tick', run: game.run, now };
      const next = arenaReducer(game, tick);
      if (next.phase === 'reveal') actions.push(tick);
      game = next;
    }
    return { game, baseRun: data.baseRun, actions };
  } catch { return null; }
}

export function arenaSessionReducer(session: ArenaSession, action: ArenaSessionAction): ArenaSession {
  if (action.type === 'resume') {
    if (session.game.phase !== 'ready' || session.actions !== null) return session;
    return restoreArenaSession(action.raw, action.now) ?? session;
  }
  const game = arenaReducer(session.game, action);
  if (game === session.game) return session;
  if (action.type === 'reset') return { game, baseRun: game.run, actions: [] };
  // Tick updates should not write to storage five times a second.
  if (action.type === 'tick' && game.phase === 'round') return { ...session, game };
  return { ...session, game, actions: [...(session.actions ?? []), action] };
}
