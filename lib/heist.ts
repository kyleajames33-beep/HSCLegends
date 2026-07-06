import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

// ── Heist "The Break-In" — client bindings ──
// Three layers (see docs/heist-redesign.md §4):
//   engine  — synced quiz rounds (rooms/players rows + postgres_changes)
//   economy — energy/raids/sentries via server-validated RPCs
//   action  — raider + spotlight positions over realtime BROADCAST (never DB)

export type HeistState = {
  round: number; total: number; status: 'lobby' | 'active' | 'finished';
  stem: string | null; options: string[] | null;
  round_started_at: string | null; per_q_seconds: number; starts_at: string | null;
  is_heist: boolean; gold_a: number; gold_b: number; players: number;
  raiders_a: number; raiders_b: number; // live raids targeting each vault
};
export type HeistResult = { alias: string; team: 'a' | 'b'; gold: number; is_me: boolean; stolen: number; catches: number };
export type HeistMe = { energy: number; gold: number; team: 'a' | 'b'; stolen: number; catches: number; team_traps: number };
export type HeistTrap = { id: string; x: number; y: number };
export type HeistRaid = { raid_id: string; started_at: string; target_team: 'a' | 'b'; energy: number; traps: HeistTrap[] };
export type HeistRaidOutcome = { outcome: 'banked' | 'caught' | 'expired'; loot: number; penalty: number };
export type HeistLeader = { alias: string; games: number; wins: number; stolen: number; catches: number; is_me: boolean };
export type HeistRaidRow = {
  id: string; raider_id: string; raider_alias: string; target_team: 'a' | 'b';
  status: 'active' | 'banked' | 'caught' | 'expired';
  rooms_looted: number; loot: number; caught_by: string | null;
};

export const HEIST_COST = { raid: 60, sentry: 30 } as const;

// Board geometry contract — 100×100 units, mirrored in the SQL validation
// (heist_place_trap) and the loot percentages (heist_raid_end). Placeholder
// shapes; real art drops into the same slots later.
export const HEIST_BOARD = {
  entryY: 86, // y >= entryY is the safe entry/escape zone
  pads: [
    { x: 20, y: 74, pct: 10 },
    { x: 80, y: 50, pct: 15 },
    { x: 50, y: 20, pct: 20 },
  ],
  // Walls as rects; gaps are the doorways (room1→2 at x 60–76, room2→3 at x 24–40).
  walls: [
    { x: 0, y: 61, w: 60, h: 2 },
    { x: 76, y: 61, w: 24, h: 2 },
    { x: 0, y: 37, w: 24, h: 2 },
    { x: 40, y: 37, w: 60, h: 2 },
  ],
  playerR: 2.2, sentryR: 4, spotR: 8, padR: 4.5,
  grabSeconds: 1.2, catchSeconds: 1.2, raidSeconds: 45,
} as const;

export async function heistQuickJoin(sb: SupabaseClient, subject: Subject, year: 11 | 12, alias: string) {
  const { data, error } = await sb.rpc('heist_quick_join', { p_subject: subject, p_year: year, p_alias: alias });
  if (error) throw new Error(error.message);
  return data[0] as { room_id: string; player_id: string; code: string; team: 'a' | 'b' };
}
export async function heistJoin(sb: SupabaseClient, code: string, alias: string) {
  const { data, error } = await sb.rpc('heist_join', { p_code: code.toUpperCase(), p_alias: alias });
  if (error) throw new Error(error.message);
  return data[0] as { room_id: string; player_id: string; team: 'a' | 'b' };
}

// Drop recovery: restore an existing player (team/gold/energy intact) after a
// refresh or crash. Returns null when no matching player is found.
export async function heistRejoin(sb: SupabaseClient, code: string, alias: string) {
  const { data, error } = await sb.rpc('heist_rejoin', { p_code: code.toUpperCase(), p_alias: alias });
  if (error) throw new Error(error.message);
  return (data?.[0] ?? null) as { room_id: string; player_id: string; team: 'a' | 'b'; gold: number } | null;
}
export async function heistState(sb: SupabaseClient, room: string): Promise<HeistState> {
  const { data, error } = await sb.rpc('heist_state', { p_room: room });
  if (error) throw new Error(error.message);
  return data[0];
}
export async function heistSubmit(sb: SupabaseClient, player: string, round: number, choice: number) {
  const { data, error } = await sb.rpc('heist_submit', { p_player: player, p_round: round, p_choice: choice });
  if (error) throw new Error(error.message);
  return data[0] as { correct: boolean; correct_index: number; points: number; stole: boolean; energy: number };
}
export async function heistMe(sb: SupabaseClient, player: string): Promise<HeistMe | null> {
  const { data, error } = await sb.rpc('heist_me', { p_player: player });
  if (error) throw new Error(error.message);
  return (data?.[0] ?? null) as HeistMe | null;
}
export async function heistPlaceTrap(sb: SupabaseClient, player: string, x: number, y: number) {
  const { data, error } = await sb.rpc('heist_place_trap', { p_player: player, p_x: x, p_y: y });
  if (error) throw new Error(error.message);
  return data[0] as { trap_id: string; energy: number };
}
export async function heistGetTraps(sb: SupabaseClient, room: string, team: 'a' | 'b'): Promise<HeistTrap[]> {
  const { data, error } = await sb.rpc('heist_get_traps', { p_room: room, p_team: team });
  if (error) throw new Error(error.message);
  return (data ?? []) as HeistTrap[];
}
export async function heistRaidStart(sb: SupabaseClient, player: string): Promise<HeistRaid> {
  const { data, error } = await sb.rpc('heist_raid_start', { p_player: player });
  if (error) throw new Error(error.message);
  return data[0] as HeistRaid;
}
export async function heistRaidEnd(
  sb: SupabaseClient, raid: string, player: string,
  outcome: 'banked' | 'caught' | 'expired', rooms = 0,
  catcher: string | null = null, trap: string | null = null, cause: string | null = null,
): Promise<HeistRaidOutcome> {
  const { data, error } = await sb.rpc('heist_raid_end', {
    p_raid: raid, p_player: player, p_outcome: outcome, p_rooms: rooms,
    p_catcher: catcher, p_trap: trap, p_cause: cause,
  });
  if (error) throw new Error(error.message);
  return data[0] as HeistRaidOutcome;
}
export async function heistLeaderboard(sb: SupabaseClient, days = 90): Promise<HeistLeader[]> {
  const { data, error } = await sb.rpc('heist_leaderboard', { p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []) as HeistLeader[];
}
export async function heistStart(sb: SupabaseClient, room: string) { await sb.rpc('heist_start', { p_room: room }); }
export async function heistAdvance(sb: SupabaseClient, room: string, round: number) { await sb.rpc('heist_advance', { p_room: room, p_round: round }); }
export async function heistResults(sb: SupabaseClient, room: string): Promise<HeistResult[]> {
  const { data, error } = await sb.rpc('heist_results', { p_room: room });
  if (error) throw new Error(error.message);
  return (data ?? []) as HeistResult[];
}
export function subscribeHeist(sb: SupabaseClient, room: string, onChange: () => void, onRaid?: (r: HeistRaidRow) => void): () => void {
  const ch = sb.channel(`heist:${room}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'heist_rooms', filter: `id=eq.${room}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'heist_players', filter: `room_id=eq.${room}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'heist_raids', filter: `room_id=eq.${room}` }, (payload) => {
      if (onRaid && payload.new) onRaid(payload.new as HeistRaidRow);
      onChange();
    })
    .subscribe();
  return () => { sb.removeChannel(ch); };
}

// ── Action layer: ephemeral positions over broadcast (≤10Hz, never the DB) ──
export type LivePos = {
  raid: string; player: string; alias: string;
  team: 'a' | 'b'; // the vault being raided (defenders filter on their own)
  x: number; y: number; rooms: number; det: number; // det = 0..1 detection meter
};
export type LiveSpot = { player: string; team: 'a' | 'b'; x: number; y: number };

export function joinHeistLive(sb: SupabaseClient, room: string, on: { pos?: (p: LivePos) => void; spot?: (s: LiveSpot) => void }) {
  const ch = sb.channel(`heist-live:${room}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'pos' }, ({ payload }) => on.pos?.(payload as LivePos))
    .on('broadcast', { event: 'spot' }, ({ payload }) => on.spot?.(payload as LiveSpot))
    .subscribe();
  const send = (event: 'pos' | 'spot', payload: LivePos | LiveSpot) => {
    ch.send({ type: 'broadcast', event, payload }).then(undefined, () => {});
  };
  return {
    sendPos: (p: LivePos) => send('pos', p),
    sendSpot: (s: LiveSpot) => send('spot', s),
    leave: () => { sb.removeChannel(ch); },
  };
}
