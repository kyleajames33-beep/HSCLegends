import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

export type LiveQuestion = {
  index: number;
  total: number;
  status: 'lobby' | 'active' | 'complete';
  stem: string | null;
  options: string[] | null;
  question_started_at: string | null;
  per_question_seconds: number;
};

export type Player = { id: string; alias: string; score: number };

export async function createGame(
  sb: SupabaseClient,
  subject: Subject,
  year: 11 | 12,
  count = 10
): Promise<{ code: string; session_id: string }> {
  const { data, error } = await sb.rpc('create_game', {
    p_subject: subject,
    p_year: year,
    p_count: count,
  });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function joinGame(
  sb: SupabaseClient,
  code: string,
  alias: string
): Promise<{ session_id: string; player_id: string; status: string }> {
  const { data, error } = await sb.rpc('join_game', { p_code: code.toUpperCase(), p_alias: alias });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function startGame(sb: SupabaseClient, sessionId: string) {
  const { error } = await sb.rpc('start_game', { p_session_id: sessionId });
  if (error) throw new Error(error.message);
}

export async function nextQuestion(sb: SupabaseClient, sessionId: string) {
  const { error } = await sb.rpc('next_question', { p_session_id: sessionId });
  if (error) throw new Error(error.message);
}

export async function getLiveQuestion(sb: SupabaseClient, sessionId: string): Promise<LiveQuestion> {
  const { data, error } = await sb.rpc('get_live_question', { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function submitAnswer(
  sb: SupabaseClient,
  playerId: string,
  index: number,
  choice: number
): Promise<{ is_correct: boolean; correct_index: number; points: number }> {
  const { data, error } = await sb.rpc('submit_answer', {
    p_player_id: playerId,
    p_index: index,
    p_choice: choice,
  });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function fetchPlayers(sb: SupabaseClient, sessionId: string): Promise<Player[]> {
  const { data, error } = await sb
    .from('game_players')
    .select('id,alias,score')
    .eq('session_id', sessionId)
    .order('score', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Player[];
}

// Subscribe to a game's session-row and player-row changes via Realtime.
// Returns an unsubscribe fn.
export function subscribeGame(
  sb: SupabaseClient,
  sessionId: string,
  handlers: { onSession?: () => void; onPlayers?: () => void }
): () => void {
  const channel = sb
    .channel(`game:${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
      () => handlers.onSession?.()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_players', filter: `session_id=eq.${sessionId}` },
      () => handlers.onPlayers?.()
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
