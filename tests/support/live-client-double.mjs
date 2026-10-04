import { classroomFixture as f } from '../fixtures/classroom.mjs';

// Canned transport responses for executing existing client code. No Supabase,
// credentials, HTTP, database, auth policies, subscriptions or server timers.
// ASSUMPTION: the lobby get_live_question row below is invented for conditional
// client tests. The retained repository has no SQL proving a pre-start row.
export function liveClientDouble({ status = 'lobby', receipt = null, players = null } = {}) {
  const calls = [];
  const player = { id: 'synthetic-player-1', alias: 'Test Finch', score: receipt?.points ?? 0 };
  const state = { status, receipt, players: players ?? [player] };
  const handlers = [];
  const channel = { on(_event, filter, callback) { handlers.push({ table: filter.table, callback }); return this; }, subscribe() { return this; } };
  const query = { select() { return this; }, eq() { return this; }, async order() { return { data: state.players, error: null }; } };
  return {
    calls, state, emit: (table) => handlers.filter((handler) => !table || handler.table === table).forEach(({ callback }) => callback()),
    channel: () => channel, removeChannel: () => {}, from: () => query,
    async rpc(name, args) {
      calls.push({ name, args: structuredClone(args) });
      const ok = (data) => ({ data, error: null });
      switch (name) {
        case 'create_game': return ok([{ code: f.code, session_id: f.roomId }]);
        case 'start_game': state.status = 'active'; return ok(null);
        case 'join_game': return ok([{ session_id: f.roomId, player_id: player.id, status: state.status }]);
        case 'live_rejoin': return ok([{ session_id: f.roomId, player_id: player.id, status: state.status, score: player.score }]);
        case 'get_live_question': return ok([{ index: state.status === 'lobby' ? -1 : 0, total: 2, status: state.status, stem: f.questions[0].stem, options: f.questions[0].options, question_started_at: f.startsAt, per_question_seconds: 15, is_double: false }]);
        case 'submit_answer':
          if (state.receipt) return { data: null, error: { message: 'Already answered' } };
          state.receipt = { is_correct: args.p_choice === 0, correct_index: 0, points: args.p_choice === 0 ? 100 : 0 };
          player.score += state.receipt.points; return ok([state.receipt]);
        case 'arena_heartbeat': return ok(null);
        case 'arena_presences': return ok([]);
        case 'live_answer_count': return ok([{ answered: state.receipt ? 1 : 0, total: 1, correct: state.receipt?.is_correct ? 1 : 0 }]);
        default: throw new Error(`Unmocked RPC: ${name}`);
      }
    },
  };
}
