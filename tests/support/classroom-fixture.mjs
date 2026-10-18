import { createClassroomCore, hashSessionSecret, sealSessionQuestions } from '../../lib/classroom-server/classroom-core.mjs';

// Deliberately synthetic proof held in the fake server, never page state/storage.
// This is not a credential issuer, browser cookie implementation, or auth verifier.
const SECRET = 'SYNTHETIC-NONSECRET-CLIENT-OWNER-0000000000';
export function fixture(principalId = null) {
  const state = {
    sessions: new Map([['room-a', { id: 'room-a', hostId: 'host-a', status: 'active', currentIndex: 0,
      startedAt: 0, durationMs: 15000, expiresAt: 100000, doubleIndex: null,
      questionSet: sealSessionQuestions([
        { stem: 'Synthetic question', options: ['Original A', 'Original B'], correctIndex: 0, revision: 'v1' },
        { stem: 'Synthetic second question', options: ['Second C', 'Second D'], correctIndex: 1, revision: 'v2' },
      ]) }]]),
    players: new Map([['alice', { id: 'alice', sessionId: 'room-a', alias: 'Same alias', score: 0, ownerId: principalId }],
      ['bob', { id: 'bob', sessionId: 'room-a', alias: 'Same alias', score: 200, ownerId: null }]]),
    guestSessions: new Map([['alice', { playerId: 'alice', sessionId: 'room-a', secretHash: hashSessionSecret(SECRET), expiresAt: 50000 }]]),
    answers: new Map(), claims: new Map(), xp: new Map(),
  };
  let tail = Promise.resolve();
  const repo = { transaction(fn) {
    const result = tail.then(async () => { const draft = structuredClone(state); const value = await fn(draft); Object.assign(state, draft); return structuredClone(value); });
    tail = result.catch(() => {}); return result;
  } };
  const core = createClassroomCore({ repo, now: () => 1000 });
  const proof = { sessionId: 'room-a', playerId: 'alice', secret: SECRET };
  const binding = { sessionId: 'room-a', playerId: 'alice', principalId };
  const calls = []; const watchers = new Set();
  const room = () => state.sessions.get('room-a');
  const assertBinding = b => { if (JSON.stringify(b) !== JSON.stringify(binding)) throw new Error('forbidden'); };
  const transport = {
    enabled: true,
    async join(input) { calls.push(['join', input]); return { ...binding }; },
    async restore() { calls.push(['restore']); return { ...binding }; },
    async ownSnapshot(b) {
      assertBinding(b); calls.push(['snapshot']);
      let value;
      if (room().status === 'complete') {
        await core.ownStanding(proof); // Authenticated terminal state, no past-end indexing.
        value = { schemaVersion: 1, ...binding, status: 'complete', index: room().currentIndex,
          question: null, ownReceipt: null, contentStatus: 'current-session' };
      } else value = await core.snapshot(proof, room().currentIndex);
      return { ...value, principalId, total: room().questionSet?.questions.length ?? null,
        startedAt: room().startedAt, durationMs: room().durationMs, isDouble: room().currentIndex === room().doubleIndex };
    },
    async submit(b, answer) { assertBinding(b); calls.push(['submit', answer]); return { schemaVersion: 1, ...binding, ownReceipt: await core.submit(proof, answer) }; },
    async ownStanding(b) { assertBinding(b); calls.push(['standing']); return { schemaVersion: 1, ...binding, ...await core.ownStanding(proof) }; },
    watch(b, changed) { assertBinding(b); watchers.add(changed); return () => watchers.delete(changed); },
  };
  return { core, state, proof, binding, transport, calls, room, emit: () => [...watchers].forEach(fn => fn()) };
}
export const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
export const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
