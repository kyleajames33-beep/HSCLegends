import { useSyncExternalStore } from 'react';
export let scenario = 'fresh';
export const sessionId = '11111111-1111-4111-8111-111111111111';
export const playerId = '22222222-2222-4222-8222-222222222222';
const accountId = '33333333-3333-4333-8333-333333333333';
let auth = { user: null, loading: false };
let count = { joins: 0, restores: 0, reads: 0, submits: 0, standings: 0, leaves: 0, revocations: 0, pending: 0 };
let listeners = new Set();
let watchers = new Set();
let receipt = null;
let index = 0;
let complete = false;
let startedAt = Date.now();
let holdNext = false;
let malformedNext = false;
let held = null;
let hasCookie = true;
let revoked = false;
let rejectLeave = false;
let loseLeaveAck = false;
const emit = () => { count = { ...count }; listeners.forEach(f => f()); };
export const subscribe = (f) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const getCounts = () => count;
export function useUser() { return useSyncExternalStore(subscribe, () => auth, () => auth); }
export function identity(mode) { auth = { user: mode ? { id: mode === 'anonymous' ? '44444444-4444-4444-8444-444444444444' : mode === 'second' ? '55555555-5555-4555-8555-555555555555' : accountId, is_anonymous: mode === 'anonymous' } : null, loading: false }; emit(); }
const binding = () => ({ sessionId, playerId, principalId: auth.user?.id ?? null });
const makeReceipt = (choice, historical = false) => ({ questionIndex: index, acceptedChoice: choice, isCorrect: choice === 1, points: choice === 1 ? 450 : 0, answeredAt: 1760000000000, correctIndex: historical ? null : 1, contentRevision: historical ? null : `synthetic-v${index}`, keyProvenance: historical ? 'legacy-unavailable' : 'frozen' });
function snapshot() { return { schemaVersion: 1, ...binding(), status: complete ? 'complete' : 'active', index: complete ? 2 : index, total: 2, startedAt: complete ? null : startedAt, durationMs: complete ? null : 3600000, isDouble: false, question: complete || scenario === 'historical' ? null : { stem: index === 0 ? 'What is 2 + 2?' : 'What is 3 + 3?', options: index === 0 ? ['3', '4', '5', '6'] : ['5', '6', '7', '8'], contentRevision: `synthetic-v${index}` }, contentStatus: receipt && !complete ? scenario === 'historical' ? 'historical-content-unavailable' : 'frozen' : 'current-session', ownReceipt: complete ? null : receipt }; }
export function configure(next) { scenario = next; hasCookie = true; revoked = false; rejectLeave = false; loseLeaveAck = false; index = 0; complete = false; startedAt = Date.now(); receipt = ['committed', 'historical'].includes(next) ? makeReceipt(1, next === 'historical') : null; count = { joins: 0, restores: 0, reads: 0, submits: 0, standings: 0, leaves: 0, revocations: 0, pending: 0 }; auth = { user: null, loading: false }; }
export function queueStale() { holdNext = true; emit(); }
export function advance() { index = 1; receipt = null; startedAt = Date.now(); emit(); watchers.forEach(f => f()); }
export function releaseStale() { held?.(); held = null; }
export function finish() { complete = true; emit(); watchers.forEach(f => f()); }
export function corruptNext() { malformedNext = true; emit(); }
export function rejectServerLeave() { rejectLeave = true; emit(); }
export function loseNextLeaveAck() { loseLeaveAck = true; emit(); }
export const transport = {
    enabled: true,
    async join(input) { count.joins++; emit(); if (input.code !== 'SYN123' || input.alias !== 'Synthetic guest')
        throw Error('synthetic-input'); if (!hasCookie) { index = 0; receipt = null; complete = false; startedAt = Date.now(); } hasCookie = true; revoked = false; return binding(); },
    async restore() { count.restores++; emit(); if (!hasCookie || revoked) throw Error('synthetic-session-unavailable'); return binding(); },
    async leave({ intent }) {
        count.leaves++; emit();
        if (intent === 'revoke-session') {
            if (rejectLeave) throw Error('synthetic-ownership-mismatch');
            if (!revoked && hasCookie) { revoked = true; count.revocations++; emit(); }
            if (loseLeaveAck) { loseLeaveAck = false; throw Error('synthetic-lost-leave-acknowledgement'); }
        } else if (intent !== 'forget-browser') throw Error('synthetic-invalid-intent');
        hasCookie = false; emit(); return { schemaVersion: 1, disposition: 'left-this-device' };
    },
    async ownSnapshot() { if (!hasCookie || revoked) throw Error('synthetic-session-unavailable'); count.reads++; const value = snapshot(); if (malformedNext) {
        value.playerId = 'foreign-synthetic-player';
        malformedNext = false;
    } if (holdNext) {
        holdNext = false;
        count.pending++;
        emit();
        return new Promise(resolve => { held = () => { count.pending--; emit(); resolve(value); }; });
    } emit(); return value; },
    async submit(_, answer) { count.submits++; if (!receipt)
        receipt = makeReceipt(answer.choice); emit(); throw Error('synthetic-acknowledgement-lost-after-commit'); },
    async ownStanding() { count.standings++; emit(); return { schemaVersion: 1, ...binding(), rank: 2, score: 450 }; },
    watch(_, f) { watchers.add(f); return () => { watchers.delete(f); }; }
};
