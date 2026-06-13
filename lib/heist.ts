import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

export type HeistState = {
  round: number; total: number; status: 'lobby' | 'active' | 'finished';
  stem: string | null; options: string[] | null;
  round_started_at: string | null; per_q_seconds: number; starts_at: string | null;
  is_heist: boolean; gold_a: number; gold_b: number; players: number;
};
export type HeistResult = { alias: string; team: 'a' | 'b'; gold: number; is_me: boolean };

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
export async function heistState(sb: SupabaseClient, room: string): Promise<HeistState> {
  const { data, error } = await sb.rpc('heist_state', { p_room: room });
  if (error) throw new Error(error.message);
  return data[0];
}
export async function heistSubmit(sb: SupabaseClient, player: string, round: number, choice: number) {
  const { data, error } = await sb.rpc('heist_submit', { p_player: player, p_round: round, p_choice: choice });
  if (error) throw new Error(error.message);
  return data[0] as { correct: boolean; correct_index: number; points: number; stole: boolean };
}
export async function heistStart(sb: SupabaseClient, room: string) { await sb.rpc('heist_start', { p_room: room }); }
export async function heistAdvance(sb: SupabaseClient, room: string, round: number) { await sb.rpc('heist_advance', { p_room: room, p_round: round }); }
export async function heistResults(sb: SupabaseClient, room: string): Promise<HeistResult[]> {
  const { data, error } = await sb.rpc('heist_results', { p_room: room });
  if (error) throw new Error(error.message);
  return (data ?? []) as HeistResult[];
}
export function subscribeHeist(sb: SupabaseClient, room: string, onChange: () => void): () => void {
  const ch = sb.channel(`heist:${room}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'heist_rooms', filter: `id=eq.${room}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'heist_players', filter: `room_id=eq.${room}` }, onChange)
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
