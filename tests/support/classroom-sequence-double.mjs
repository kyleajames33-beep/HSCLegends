import { classroomFixture } from '../fixtures/classroom.mjs';

// A scripted, offline response source for current client APIs. This is not a
// backend implementation, receipt recovery API or concurrency/security test.
// Synthetic choices/scores below are fixture rules only. Lobby status rows
// remain an explicit unverified assumption in the retained server contract.
export function classroomSequenceDouble() {
  const calls = []; const players = []; const receipts = new Map(); const channels = new Set();
  let status = 'lobby'; let index = -1;
  const emit = (table) => {
    for (const channel of channels) for (const handler of channel.handlers) if (handler.table === table) handler.callback();
  };
  const client = () => ({
    channel() {
      const channel = { handlers: [], on(_event, filter, callback) { this.handlers.push({ table: filter.table, callback }); return this; }, subscribe() { channels.add(this); return this; } };
      return channel;
    },
    removeChannel(channel) { channels.delete(channel); },
    from() { return { select() { return this; }, eq() { return this; }, async order() { return { data: structuredClone([...players].sort((a, b) => b.score - a.score)), error: null }; } }; },
    async rpc(name, args) {
      calls.push({ name, args: structuredClone(args) }); const ok = (data) => ({ data, error: null });
      switch (name) {
        case 'create_game': return ok([{ code: 'LAB001', session_id: 'sequence-room' }]);
        case 'join_game': {
          const player = { id: `sequence-player-${players.length + 1}`, alias: args.p_alias, score: 0 };
          players.push(player); emit('game_players'); return ok([{ session_id: 'sequence-room', player_id: player.id, status }]);
        }
        case 'live_rejoin': {
          if (status === 'complete') return { data: null, error: { message: 'Game not found' } };
          const player = players.find((row) => row.alias === args.p_alias);
          return ok(player ? [{ session_id: 'sequence-room', player_id: player.id, status, score: player.score }] : []);
        }
        case 'start_game': status = 'active'; index = 0; emit('game_sessions'); return ok(null);
        case 'next_question': index++; if (index >= classroomFixture.questions.length) status = 'complete'; emit('game_sessions'); return ok(null);
        case 'get_live_question': {
          const q = classroomFixture.questions[Math.max(0, Math.min(index, classroomFixture.questions.length - 1))];
          return ok([{ index, total: classroomFixture.questions.length, status, stem: q.stem, options: q.options, question_started_at: classroomFixture.startsAt, per_question_seconds: 15, is_double: false }]);
        }
        case 'submit_answer': {
          const key = `${args.p_player_id}:${args.p_index}`;
          if (receipts.has(key)) return { data: null, error: { message: 'Already answered' } };
          const q = classroomFixture.questions[args.p_index];
          const correct = args.p_choice === q.correctIndex;
          const receipt = { is_correct: correct, correct_index: q.correctIndex, points: correct ? 100 : 0 };
          receipts.set(key, { ...receipt, index: args.p_index });
          players.find((row) => row.id === args.p_player_id).score += receipt.points;
          emit('game_players'); return ok([receipt]);
        }
        case 'live_answer_count': {
          const answers = [...receipts.values()].filter((row) => row.index === args.p_index);
          return ok([{ answered: answers.length, total: players.length, correct: answers.filter((row) => row.is_correct).length }]);
        }
        case 'arena_heartbeat': return ok(null);
        case 'arena_presences': return ok(players.map((row) => ({ player_id: row.id, last_seen: new Date().toISOString() })));
        default: throw new Error(`Unmocked RPC: ${name}`);
      }
    },
  });
  return { client, calls, players, receipts };
}
