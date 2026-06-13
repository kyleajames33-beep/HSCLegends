import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

export type KoStatus = 'lobby' | 'active' | 'finished';

export type KoState = {
  round: number;
  total: number;
  status: KoStatus;
  stem: string | null;
  options: string[] | null;
  round_started_at: string | null;
  per_q_seconds: number;
  starts_at: string | null;
  alive: number;
  players: number;
};

export type KoMe = { alive: boolean; score: number; eliminated_round: number | null };
export type KoResult = {
  rank: number; alias: string; score: number; alive: boolean; eliminated_round: number | null; is_me: boolean;
};

export async function koQuickJoin(sb: SupabaseClient, subject: Subject, year: 11 | 12, alias: string) {
  const { data, error } = await sb.rpc('ko_quick_join', { p_subject: subject, p_year: year, p_alias: alias });
  if (error) throw new Error(error.message);
  return data[0] as { room_id: string; player_id: string; code: string };
}

export async function koJoin(sb: SupabaseClient, code: string, alias: string) {
  const { data, error } = await sb.rpc('ko_join', { p_code: code.toUpperCase(), p_alias: alias });
  if (error) throw new Error(error.message);
  return data[0] as { room_id: string; player_id: string };
}

export async function koState(sb: SupabaseClient, room: string): Promise<KoState> {
  const { data, error } = await sb.rpc('ko_state', { p_room: room });
  if (error) throw new Error(error.message);
  return data[0] as KoState;
}

export async function koMyState(sb: SupabaseClient, playerId: string): Promise<KoMe | null> {
  const { data } = await sb.from('ko_players').select('alive,score,eliminated_round').eq('id', playerId).maybeSingle();
  return (data as KoMe) ?? null;
}

export async function koSubmit(sb: SupabaseClient, player: string, round: number, choice: number) {
  const { data, error } = await sb.rpc('ko_submit', { p_player: player, p_round: round, p_choice: choice });
  if (error) throw new Error(error.message);
  return data[0] as { correct: boolean; correct_index: number; points: number };
}

export async function koStart(sb: SupabaseClient, room: string) {
  await sb.rpc('ko_start', { p_room: room });
}

export async function koAdvance(sb: SupabaseClient, room: string, round: number) {
  await sb.rpc('ko_advance', { p_room: room, p_round: round });
}

export async function koResults(sb: SupabaseClient, room: string): Promise<KoResult[]> {
  const { data, error } = await sb.rpc('ko_results', { p_room: room });
  if (error) throw new Error(error.message);
  return (data ?? []) as KoResult[];
}

// React to room + player changes for this room.
export function subscribeRoom(sb: SupabaseClient, room: string, onChange: () => void): () => void {
  const ch = sb
    .channel(`ko:${room}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ko_rooms', filter: `id=eq.${room}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ko_players', filter: `room_id=eq.${room}` }, onChange)
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
