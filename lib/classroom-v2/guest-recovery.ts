/**
 * Staging-only recovery selectors. These values are hints, not credentials.
 * A separately authenticated, owner-bound v2 client must confirm a snapshot.
 * This module never creates a guest account or stores a token.
 */
import type { InitResult, StudentSnapshot } from './index';

const KEY = 'hsclegends.classroom-v2.guest-recovery.v1';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_BYTES = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Actor = { actorId: string; generation: number };
type Selector = { actorId: string; projectId: string; roomId: string; playerId: string; savedAt: number };
type Client = Extract<InitResult, { status: 'available' }>['client'];
type Saved = Selector & { version: 1 };
const validId = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
const validProject = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(s);
const validTime = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const validActor = (a: Actor | null): a is Actor => !!a && validId(a.actorId) && validTime(a.generation);
const sameActor = (a: Actor | null, b: Actor) => validActor(a) && a.actorId === b.actorId && a.generation === b.generation;

/** False means storage is unavailable or the supplied selectors are invalid. */
export function saveGuestRecovery(storage: StorageLike, value: Omit<Selector, 'savedAt'>, now = Date.now()): boolean {
  if (!validId(value.actorId) || !validId(value.roomId) || !validId(value.playerId) || !validProject(value.projectId) || !validTime(now)) return false;
  const saved: Saved = { version: 1, actorId: value.actorId, projectId: value.projectId, roomId: value.roomId, playerId: value.playerId, savedAt: now };
  try { storage.setItem(KEY, JSON.stringify(saved)); return true; } catch { return false; }
}

/** Read only matching selectors. Expiry is a local convenience, never authority. */
export function readGuestRecovery(storage: StorageLike, actorId: string, projectId: string, now = Date.now()): Selector | null {
  if (!validId(actorId) || !validProject(projectId) || !validTime(now)) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw || raw.length > MAX_BYTES) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const row = data as Record<string, unknown>;
    if (Object.keys(row).sort().join(',') !== 'actorId,playerId,projectId,roomId,savedAt,version' || row.version !== 1 || row.actorId !== actorId || row.projectId !== projectId || !validId(row.roomId) || !validId(row.playerId) || !validTime(row.savedAt) || row.savedAt > now || now - row.savedAt >= MAX_AGE_MS) return null;
    return { actorId, projectId, roomId: row.roomId, playerId: row.playerId, savedAt: row.savedAt };
  } catch { return null; }
}

export function clearGuestRecovery(storage: StorageLike): boolean {
  try { storage.removeItem(KEY); return true; } catch { return false; }
}

type RecoveryResult =
  | { status: 'unavailable' | 'obsolete' | 'missing' | 'failed' }
  | { status: 'recovered'; client: Client; snapshot: StudentSnapshot };

/**
 * Open a fresh, separately owned client per attempt. Ownership of a successful
 * client transfers to the caller, who must dispose it on every auth change and
 * teardown. The server snapshot, not this cache, authorizes the participant.
 */
export async function recoverGuestSession(input: {
  storage: StorageLike;
  projectId: string;
  currentActor: () => Actor | null;
  openClient: (actor: Actor) => Promise<InitResult>;
  now?: number;
}): Promise<RecoveryResult> {
  let actor: Actor | null;
  try { actor = input.currentActor(); } catch { return { status: 'unavailable' }; }
  if (!validActor(actor) || !validProject(input.projectId)) return { status: 'unavailable' };
  const captured = { ...actor };
  const current = () => { try { return sameActor(input.currentActor(), captured); } catch { return false; } };
  const saved = readGuestRecovery(input.storage, captured.actorId, input.projectId, input.now);
  if (!saved) return { status: 'missing' };
  let client: Client | null = null;
  try {
    const initialized = await input.openClient(captured);
    if (initialized.status === 'available') client = initialized.client;
    if (!current()) { client?.dispose(); return { status: 'obsolete' }; }
    if (!client) return { status: 'unavailable' };
    client.bindStudent(saved.roomId, saved.playerId);
    const snapshot = await client.snapshot();
    if (!current()) { client.dispose(); return { status: 'obsolete' }; }
    if (!snapshot || snapshot.roomId !== saved.roomId) { client.dispose(); return { status: 'failed' }; }
    return { status: 'recovered', client, snapshot };
  } catch {
    client?.dispose();
    return { status: current() ? 'failed' : 'obsolete' };
  }
}
