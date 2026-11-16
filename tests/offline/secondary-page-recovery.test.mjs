import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, elements, textContent } from '../support/source-harness.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function setup(route, functions = {}) {
  const auth = { user: { id: 'account-a' }, loading: false }, slots = [];
  let cursor = 0, dirty = false, effects = [], mounted = true, lateWrites = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { if (!mounted) lateWrites++; const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(factory, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const calls = { celebrate: 0, quests: 0 };
  const sb = { rpc() { calls.quests++; return Promise.resolve({ data: null, error: null }); } };
  const learning = { getProgress: async () => [], getWeakTopics: async () => [], bandRange: () => 'Band 3', levelLabel: () => 'New', getDueReviews: async () => [], gradeReview: async () => ({ awarded: 0 }), ...functions };
  const events = { getEvent: async () => null, getEventBoard: async () => [], claimEventReward: async () => '10 Sparks', ...functions };
  const duel = { duelMyElo: async () => null, duelTier: () => ({ min: 0, next: null, progress: 0, color: '#555', name: 'Starter', icon: '☆' }), duelFindOrCreate: async () => ({ duel_id: 'duel-a' }), duelQuestion: async () => ({ total: 2, stem: 'Question one', options: ['A', 'B'] }), duelAnswer: async () => ({ correct: true, correct_index: 0 }), duelResult: async () => ({ outcome: 'win', my_elo: 10, my_score: 2 }), getDuelLadder: async () => [], ...functions };
  const Page = loadSourceModule(`app/${route}/page.tsx`, {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' },
    'next/link': { default: 'a' }, '@/lib/supabase/client': { createClient: () => sb }, '@/lib/use-user': { useUser: () => auth }, '@/lib/questions': { SUBJECTS: [{ id: 'biology', label: 'Biology' }] },
    '@/lib/learning': learning, '@/lib/events': events, '@/lib/duel': duel, '@/lib/confetti': { celebrate: () => { calls.celebrate++; } },
    '@/components/mastery-ring': { default: 'MasteryRing' }, '@/components/answer-tile': { default: 'AnswerTile' }, '@/components/count-up': { default: ({ to }) => to }, '@/components/math-text': { default: ({ text }) => text }, '@/components/avatar': { default: 'Avatar' },
  }).default;
  async function render() { let tree; for (let pass = 0; pass < 12; pass++) { cursor = 0; dirty = false; tree = Page(); const work = effects; effects = []; for (const f of work) f(); for (let tick = 0; tick < 8; tick++) await Promise.resolve(); if (!dirty) return tree; } throw Error('Page did not settle'); }
  function button(tree, name) { const b = elements(tree).find(e => e.type === 'button' && textContent(e).includes(name)); assert.ok(b, `Missing button ${name}`); return b; }
  return { render, auth, button, calls, unmount() { for (const slot of slots) slot?.cleanup?.(); mounted = false; }, get lateWrites() { return lateWrites; } };
}
const question = id => ({ id, subject: 'biology', topic: 'Topic', stem: `Question ${id}`, options: ['Right', 'Wrong'], correct_index: 0, explanation: 'Because it is right.' });
const eventInfo = { id: 'event-a', name: 'Science Cup', target: 2, my_points: 2, ends_at: '2030-01-01T00:00:00Z', reward_coins: 10, claimed: false, player_count: 1, my_rank: 1 };

test('Progress hides former-account rows and ignores old load errors and unmounted reads', async () => {
  const requests = [];
  const h = setup('progress', { getProgress: () => { const d = deferred(); requests.push(d); return d.promise; } });
  await h.render(); h.auth.user = { id: 'account-b' }; let tree = await h.render(); assert.match(textContent(tree), /Loading your progress/);
  requests[0].reject(new Error('old account failure')); tree = await h.render(); assert.doesNotMatch(textContent(tree), /old account failure/);
  requests[1].resolve([]); tree = await h.render(); assert.match(textContent(tree), /No data yet/);
  h.auth.user = { id: 'account-c' }; await h.render(); h.unmount(); requests[2].resolve([]); await Promise.resolve(); await Promise.resolve(); assert.equal(h.lateWrites, 0);
});

test('Event shows initial load failures rather than claiming there is no live event', async () => {
  const h = setup('event', { getEvent: async () => { throw Error('transport unavailable'); } });
  const tree = await h.render(); assert.match(textContent(tree), /transport unavailable/); assert.doesNotMatch(textContent(tree), /No live event right now/);
});

test('Event claims once and retains confirmed completion when refresh fails', async () => {
  const claim = deferred(); let claims = 0, reads = 0;
  const h = setup('event', { getEvent: () => ++reads === 1 ? Promise.resolve(eventInfo) : Promise.reject(Error('refresh offline')), claimEventReward: () => { claims++; return claim.promise; } });
  let tree = await h.render(); const action = h.button(tree, 'Claim 10 Sparks').props.onClick;
  const p = action(); action(); assert.equal(claims, 1); claim.resolve('10 Sparks'); await p;
  tree = await h.render(); assert.match(textContent(tree), /Reward claimed/); assert.match(textContent(tree), /leaderboard could not be refreshed/); assert.equal(h.calls.celebrate, 1);
});

test('Event ignores a prior account claim response and its stale action', async () => {
  const pending = deferred(); let claims = 0;
  const h = setup('event', { getEvent: async () => eventInfo, claimEventReward: () => { claims++; return pending.promise; } });
  let tree = await h.render(); const action = h.button(tree, 'Claim 10 Sparks').props.onClick; const p = action();
  h.auth.user = { id: 'account-b' }; tree = await h.render(); action(); assert.equal(claims, 1);
  pending.resolve('old reward'); await p; tree = await h.render(); assert.doesNotMatch(textContent(tree), /old reward/); assert.equal(h.calls.celebrate, 0);
});

test('Review guards duplicate grades and old-question callbacks before React rerenders', async () => {
  const pending = deferred(); let grades = 0;
  const h = setup('review', { getDueReviews: async () => [question('one'), question('two')], gradeReview: () => { grades++; return pending.promise; } });
  let tree = await h.render(); const oldChoice = elements(tree).find(e => e.type === 'AnswerTile').props.onClick; oldChoice(); oldChoice();
  tree = await h.render(); const oldGrade = h.button(tree, 'Good').props.onClick; const p = oldGrade(); oldGrade(); assert.equal(grades, 1);
  pending.resolve({ awarded: 2 }); await p; oldGrade(); oldChoice(); assert.equal(grades, 1);
  tree = await h.render(); assert.match(textContent(tree), /Question two/); assert.equal(elements(tree).some(e => e.type === 'button' && textContent(e) === 'Good'), false);
});

test('Review ignores an unmounted grade response and a former account deck', async () => {
  const pending = deferred(); let calls = 0;
  const h = setup('review', { getDueReviews: async () => [question('one')], gradeReview: () => { calls++; return pending.promise; } });
  let tree = await h.render(); elements(tree).find(e => e.type === 'AnswerTile').props.onClick(); tree = await h.render(); const action = h.button(tree, 'Good').props.onClick; const p = action(); h.unmount(); action(); assert.equal(calls, 1);
  pending.resolve({ awarded: 20 }); await p; assert.equal(h.lateWrites, 0);
});

test('Duel prevents duplicate submissions and old question answers, and reports next-load errors', async () => {
  let answers = 0, questions = 0; const answer = deferred();
  const h = setup('duel', { duelQuestion: async () => { questions++; if (questions === 3) throw Error('next question offline'); return { total: 3, stem: `Duel question ${questions}`, options: ['A', 'B'] }; }, duelAnswer: () => { answers++; return answer.promise; } });
  let tree = await h.render(); await h.button(tree, 'Find a Duel').props.onClick(); tree = await h.render(); const oldAnswer = elements(tree).find(e => e.type === 'AnswerTile').props.onClick;
  const p = oldAnswer(); oldAnswer(); assert.equal(answers, 1); answer.resolve({ correct: true, correct_index: 0 }); await p;
  tree = await h.render(); await h.button(tree, 'Next').props.onClick(); oldAnswer(); assert.equal(answers, 1); tree = await h.render(); assert.match(textContent(tree), /Duel question 2/);
  await elements(tree).find(e => e.type === 'AnswerTile').props.onClick(); tree = await h.render(); await h.button(tree, 'Next').props.onClick(); tree = await h.render(); assert.match(textContent(tree), /next question offline/);
});

test('Duel account change invalidates pending matchmaking without stranding the new player', async () => {
  const first = deferred(); let finds = 0;
  const h = setup('duel', { duelFindOrCreate: () => { finds++; return finds === 1 ? first.promise : Promise.resolve({ duel_id: 'new-duel' }); } });
  let tree = await h.render(); const oldFind = h.button(tree, 'Find a Duel').props.onClick; const p = oldFind(); oldFind(); assert.equal(finds, 1);
  h.auth.user = { id: 'account-b' }; tree = await h.render(); assert.equal(h.button(tree, 'Find a Duel').props.disabled, false); oldFind(); assert.equal(finds, 1);
  first.resolve({ duel_id: 'old-duel' }); await p; tree = await h.render(); assert.doesNotMatch(textContent(tree), /Question one/);
  await h.button(tree, 'Find a Duel').props.onClick(); tree = await h.render(); assert.match(textContent(tree), /Question one/);
});

for (const route of ['duel', 'event', 'progress', 'review']) {
  test(`${route}: signed-out rendering never exposes a previous account state`, async () => {
    const h = setup(route); h.auth.user = null;
    const tree = await h.render(); assert.match(textContent(tree), /Sign in/);
  });
}

test('Event never celebrates an empty claim response as a confirmed reward', async () => {
  const h = setup('event', { getEvent: async () => eventInfo, claimEventReward: async () => null });
  let tree = await h.render(); await h.button(tree, 'Claim 10 Sparks').props.onClick();
  tree = await h.render(); assert.match(textContent(tree), /could not be confirmed/); assert.equal(h.calls.celebrate, 0);
});
