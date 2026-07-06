import type { SupabaseClient } from '@supabase/supabase-js';

// ── Live-game robustness (Foundation C) — client side ──
// Presence heartbeat + drop-recovery session stash, shared by Knockout, Heist
// and the Live Class Game. Server side: supabase/migrations/20260705_arena_robustness.sql.
// See docs/LIVE_ROBUSTNESS.md.

export type ArenaMode = 'knockout' | 'heist' | 'gamble' | 'live';

const BEAT_MS = 10_000; // server counts you present if seen within 25s
const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // rooms expire server-side at 3h (live: 6h)

// Start the presence heartbeat for a joined player. Returns a stop function.
// Beats immediately, then every 10s, and again when the tab regains focus
// (mobile browsers throttle background timers, so the visibility beat is what
// snaps you back to "present" after unlocking the phone).
export function startHeartbeat(sb: SupabaseClient, mode: ArenaMode, playerId: string): () => void {
  const beat = () => { sb.rpc('arena_heartbeat', { p_mode: mode, p_player: playerId }).then(undefined, () => {}); };
  beat();
  const t = window.setInterval(beat, BEAT_MS);
  const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
}

// ── Drop-recovery stash ──
// The player's identity in a live game is a bare player_id in React state; a
// refresh loses it. Stash it per mode so the pick screen can offer "Rejoin".

export type ArenaSession = {
  code: string;
  room: string;   // room/session id
  player: string; // player id
  alias: string;
  team?: 'a' | 'b';
  ts: number;
};

const key = (mode: ArenaMode) => `legends_arena_${mode}`;

export function saveArenaSession(mode: ArenaMode, s: Omit<ArenaSession, 'ts'>) {
  try { localStorage.setItem(key(mode), JSON.stringify({ ...s, ts: Date.now() })); } catch { /* ignore */ }
}

export function loadArenaSession(mode: ArenaMode): ArenaSession | null {
  try {
    const raw = localStorage.getItem(key(mode));
    if (!raw) return null;
    const s = JSON.parse(raw) as ArenaSession;
    if (!s.code || !s.player || Date.now() - s.ts > SESSION_TTL_MS) { clearArenaSession(mode); return null; }
    return s;
  } catch { return null; }
}

export function clearArenaSession(mode: ArenaMode) {
  try { localStorage.removeItem(key(mode)); } catch { /* ignore */ }
}

// Presence list for a room — host/projector UIs grey out disconnected players.
export async function arenaPresences(sb: SupabaseClient, roomId: string): Promise<Map<string, number>> {
  const { data } = await sb.rpc('arena_presences', { p_room: roomId });
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { player_id: string; last_seen: string }[]) {
    m.set(r.player_id, new Date(r.last_seen).getTime());
  }
  return m;
}

// A player is "present" if seen within the last 25s (matches the SQL window).
export function isPresent(presences: Map<string, number>, playerId: string, joinedAt?: string): boolean {
  const seen = presences.get(playerId) ?? (joinedAt ? new Date(joinedAt).getTime() : 0);
  return Date.now() - seen < 25_000;
}
