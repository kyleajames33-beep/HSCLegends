import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

// ── Trust or Bust — Social-Gamble client bindings ──
// Three layers (see docs/social-gamble-redesign.md §6):
//   engine  — synced quiz rounds (rooms/players rows + postgres_changes)
//   economy — share/steal choices via server-validated RPCs
//   action  — reveal events over realtime BROADCAST (never DB)

export type GambleState = {
  round: number; total: number; status: 'lobby' | 'active' | 'finished';
  stem: string | null; options: string[] | null;
  question_id: string | null;
  round_started_at: string | null; per_q_seconds: number; starts_at: string | null;
  players: number;
};

export type GambleMe = {
  points: number;
  shares: number;
  steals: number;
  stolen_from: number;
};

export type GambleResult = {
  alias: string;
  points_earned: number;
  shares: number;
  steals: number;
  stolen_from: number;
};

export type GambleLeader = {
  alias: string;
  games: number;
  points_total: number;
  shares: number;
  steals: number;
  is_me: boolean;
};

// A row from gamble_results — the server-authoritative reveal. Clients receive
// it over postgres_changes (the table is in the realtime publication) and can
// also poll it via gambleGetResult as a fallback.
export type GambleResultRow = {
  room_id: string;
  round: number;
  player_a_id: string;
  player_b_id: string;
  choice_a: 'share' | 'steal';
  choice_b: 'share' | 'steal';
  outcome: 'both_share' | 'a_stole' | 'b_stole' | 'both_steal';
  points_a: number;
  points_b: number;
};

export async function gambleQuickJoin(sb: SupabaseClient, subject: Subject, year: 11 | 12, alias: string) {
  const { data, error } = await sb.rpc('gamble_quick_join', { p_subject: subject, p_year: year, p_alias: alias });
  if (error) throw new Error(error.message);
  return data[0] as { room_id: string; player_id: string; code: string };
}

export async function gambleJoin(sb: SupabaseClient, code: string, alias: string) {
  const { data, error } = await sb.rpc('gamble_join', { p_code: code.toUpperCase(), p_alias: alias });
  if (error) throw new Error(error.message);
  return data[0] as { room_id: string; player_id: string };
}

export async function gambleRejoin(sb: SupabaseClient, code: string, alias: string) {
  const { data, error } = await sb.rpc('gamble_rejoin', { p_code: code.toUpperCase(), p_alias: alias });
  if (error) throw new Error(error.message);
  return (data?.[0] ?? null) as { room_id: string; player_id: string; points: number } | null;
}

export async function gambleState(sb: SupabaseClient, room: string): Promise<GambleState> {
  const { data, error } = await sb.rpc('gamble_state', { p_room: room });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function gambleMe(sb: SupabaseClient, player: string): Promise<GambleMe | null> {
  const { data, error } = await sb.rpc('gamble_me', { p_player: player });
  if (error) throw new Error(error.message);
  return (data?.[0] ?? null) as GambleMe | null;
}

export async function gambleSubmit(sb: SupabaseClient, player: string, room: string, round: number, choice: number) {
  const { data, error } = await sb.rpc('gamble_submit', { p_player: player, p_room: room, p_round: round, p_choice: choice });
  if (error) throw new Error(error.message);
  return data[0] as { correct: boolean; correct_index: number; points_earned: number };
}

export async function gambleDecide(sb: SupabaseClient, player: string, room: string, round: number, partner: string, choice: 'share' | 'steal') {
  const { data, error } = await sb.rpc('gamble_decide', { p_player: player, p_room: room, p_round: round, p_partner: partner, p_choice: choice });
  if (error) throw new Error(error.message);
  return data[0] as { locked_at: string };
}

export async function gambleLeaderboard(sb: SupabaseClient, days = 90): Promise<GambleLeader[]> {
  const { data, error } = await sb.rpc('gamble_leaderboard', { p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []) as GambleLeader[];
}

export async function gambleStart(sb: SupabaseClient, room: string) {
  const { error } = await sb.rpc('gamble_start', { p_room: room });
  if (error) throw new Error(error.message);
}

export async function gambleAdvance(sb: SupabaseClient, room: string, round: number) {
  const { error } = await sb.rpc('gamble_advance', { p_room: room, p_round: round });
  if (error) throw new Error(error.message);
}

export async function gambleGetPlayers(sb: SupabaseClient, room: string) {
  const { data, error } = await sb.rpc('gamble_get_players', { p_room: room });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; alias: string; points: number; shares: number; steals: number; stolen_from: number }>;
}

export async function gambleAssignPairs(sb: SupabaseClient, room: string, round: number) {
  const { data, error } = await sb.rpc('gamble_assign_pairs', { p_room: room, p_round: round });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ player_id: string; partner_id: string; is_bot: boolean }>;
}

export async function gambleGetPartner(sb: SupabaseClient, player: string, room: string, round: number) {
  const { data, error } = await sb.rpc('gamble_get_partner', { p_player: player, p_room: room, p_round: round });
  if (error) throw new Error(error.message);
  return (data?.[0] ?? null) as { partner_id: string; alias: string } | null;
}

export async function gambleDecideDefault(sb: SupabaseClient, player: string, room: string, round: number) {
  const { data, error } = await sb.rpc('gamble_decide_default', { p_player: player, p_room: room, p_round: round });
  if (error) throw new Error(error.message);
  return data[0] as { locked_at: string };
}

export async function gambleBotDecide(sb: SupabaseClient, bot: string, room: string, round: number, partner: string) {
  const { data, error } = await sb.rpc('gamble_bot_decide', { p_bot_id: bot, p_room: room, p_round: round, p_partner_id: partner });
  if (error) throw new Error(error.message);
  return data[0] as { choice: string };
}

export async function gamblePopulateQuestions(sb: SupabaseClient, room: string, questions: Array<{ stem: string; options: string[]; correct_index: number }>) {
  const { error } = await sb.rpc('gamble_populate_questions', { p_room: room, p_questions: questions });
  if (error) throw new Error(error.message);
}

// Fallback fetch for when the realtime insert event is missed (dropped socket).
export async function gambleGetResult(sb: SupabaseClient, room: string, round: number): Promise<GambleResultRow | null> {
  const { data, error } = await sb.from('gamble_results').select('*')
    .eq('room_id', room).eq('round', round).maybeSingle();
  if (error) return null;
  return (data ?? null) as GambleResultRow | null;
}

export function subscribeGamble(
  sb: SupabaseClient, room: string, onChange: () => void,
  onResult?: (r: GambleResultRow) => void,
): () => void {
  const ch = sb.channel(`gamble:${room}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gamble_rooms', filter: `id=eq.${room}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gamble_players', filter: `room_id=eq.${room}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gamble_results', filter: `room_id=eq.${room}` }, (payload) => {
      if (onResult && payload.new) onResult(payload.new as GambleResultRow);
      onChange();
    })
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
