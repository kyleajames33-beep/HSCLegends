// Same-browser recovery hints only. Storage and user binding are NOT proof of
// authorization. Server ownership/permissions remain responsible for access.
export type ProjectorTeams = Record<string, 'a' | 'b'>;
export type CacheError = 'unavailable' | 'malformed' | 'expired' | null;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type HostRecovery = {
  version: 1; sessionId: string; code: string; ownerId: string; ts: number;
  teams: ProjectorTeams; teamMode: boolean;
};
export type AcknowledgedAnswer = {
  version: 1; sessionId: string; playerId: string; index: number;
  ownerId: string | null; ts: number;
  result: { is_correct: boolean; correct_index: number; points: number };
};
export const HOST_RECOVERY_KEY = 'legends_live_host_v1';
export const ANSWER_RECEIPT_KEY = 'legends_live_receipt_v1';
const TTL = 6 * 60 * 60 * 1000;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value) && !['constructor', 'prototype'].includes(value);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const timestamp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const integer = (v: unknown, max: number): v is number => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= max;

export function browserStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
function read(key: string, storage: StorageLike | null): { value: unknown; error: CacheError } {
  if (!storage) return { value: null, error: 'unavailable' };
  try { const raw = storage.getItem(key); return { value: raw == null ? null : JSON.parse(raw), error: null }; }
  catch (e) { return { value: null, error: e instanceof SyntaxError ? 'malformed' : 'unavailable' }; }
}
function write(key: string, value: unknown, storage: StorageLike | null): CacheError {
  try { if (!storage) return 'unavailable'; storage.setItem(key, JSON.stringify(value)); return null; }
  catch { return 'unavailable'; }
}
function remove(key: string, storage: StorageLike | null): CacheError {
  try { if (!storage) return 'unavailable'; storage.removeItem(key); return null; } catch { return 'unavailable'; }
}
export function cacheMessage(error: CacheError): string {
  if (error === 'unavailable') return 'Browser storage is unavailable. Reload recovery may not work on this device.';
  if (error === 'malformed') return 'Saved recovery data could not be read. It has not been used.';
  if (error === 'expired') return 'Saved recovery data has expired. It has not been used.';
  return '';
}
export function assignProjectorTeams(previous: ProjectorTeams, players: Array<{ id: string }>): ProjectorTeams {
  const next = { ...previous };
  let a = Object.values(next).filter((team) => team === 'a').length;
  let b = Object.values(next).filter((team) => team === 'b').length;
  for (const player of [...players].sort((x, y) => x.id.localeCompare(y.id))) {
    if (Object.hasOwn(next, player.id)) continue;
    const team = a <= b ? 'a' : 'b';
    next[player.id] = team;
    if (team === 'a') a++; else b++;
  }
  return next;
}
export function readHostRecovery(storage = browserStorage(), now = Date.now()): { record: HostRecovery | null; error: CacheError } {
  const { value: v, error } = read(HOST_RECOVERY_KEY, storage);
  if (error || v == null) return { record: null, error };
  if (!object(v) || v.version !== 1 || !id(v.sessionId) || !id(v.ownerId) || typeof v.code !== 'string' || !/^[A-Z0-9]{6}$/.test(v.code) || !timestamp(v.ts) || !object(v.teams) || Object.keys(v.teams).length > 1000 || !Object.entries(v.teams).every(([key, team]) => id(key) && (team === 'a' || team === 'b')) || typeof v.teamMode !== 'boolean') return { record: null, error: 'malformed' };
  if (now - v.ts > TTL || v.ts > now + 60_000) return { record: null, error: 'expired' };
  return { record: v as HostRecovery, error: null };
}
export const writeHostRecovery = (record: HostRecovery, storage = browserStorage()) => write(HOST_RECOVERY_KEY, record, storage);
export const clearHostRecovery = (storage = browserStorage()) => remove(HOST_RECOVERY_KEY, storage);
export function readAcknowledgedAnswer(binding: Pick<AcknowledgedAnswer, 'sessionId' | 'playerId' | 'index' | 'ownerId'>, storage = browserStorage(), now = Date.now()): { receipt: AcknowledgedAnswer | null; error: CacheError } {
  const { value: v, error } = read(ANSWER_RECEIPT_KEY, storage);
  if (error || v == null) return { receipt: null, error };
  if (!object(v) || v.version !== 1 || !id(v.sessionId) || !id(v.playerId) || !(v.ownerId === null || id(v.ownerId)) || !integer(v.index, 999) || !timestamp(v.ts) || !object(v.result) || typeof v.result.is_correct !== 'boolean' || !integer(v.result.correct_index, 99) || !integer(v.result.points, 1_000_000)) return { receipt: null, error: 'malformed' };
  if (now - v.ts > TTL || v.ts > now + 60_000) return { receipt: null, error: 'expired' };
  if (v.sessionId !== binding.sessionId || v.playerId !== binding.playerId || v.index !== binding.index || v.ownerId !== binding.ownerId) return { receipt: null, error: null };
  return { receipt: v as AcknowledgedAnswer, error: null };
}
export const writeAcknowledgedAnswer = (receipt: Omit<AcknowledgedAnswer, 'ts'> & { ts?: number }, storage = browserStorage()) => write(ANSWER_RECEIPT_KEY, { ...receipt, ts: receipt.ts ?? Date.now() }, storage);

// Unconfirmed claims survive retries. A binding is accident prevention only;
// the claim RPC still has to verify player ownership on the server.
export type PendingClaim = { version: 1; playerId: string; ownerId: string | null };
export const PENDING_CLAIM_KEY = 'legends_pending_claim';
export function readPendingClaim(storage = browserStorage()): { claim: PendingClaim | null; error: CacheError } {
  if (!storage) return { claim: null, error: 'unavailable' };
  try {
    const raw = storage.getItem(PENDING_CLAIM_KEY);
    if (raw == null) return { claim: null, error: null };
    // Previous releases stored just the player ID before redirecting to sign-in.
    if (id(raw)) return { claim: { version: 1, playerId: raw, ownerId: null }, error: null };
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1 || !id(value.playerId) || !(value.ownerId === null || id(value.ownerId))) return { claim: null, error: 'malformed' };
    return { claim: value as PendingClaim, error: null };
  } catch (e) { return { claim: null, error: e instanceof SyntaxError ? 'malformed' : 'unavailable' }; }
}
export const writePendingClaim = (claim: PendingClaim, storage = browserStorage()) => write(PENDING_CLAIM_KEY, claim, storage);
export function clearConfirmedClaim(claim: PendingClaim, storage = browserStorage()): CacheError {
  const stored = readPendingClaim(storage);
  if (stored.claim?.playerId === claim.playerId && stored.claim.ownerId === claim.ownerId) return remove(PENDING_CLAIM_KEY, storage);
  return stored.error;
}
