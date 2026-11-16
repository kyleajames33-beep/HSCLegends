import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, textContent } from '../support/source-harness.mjs';

function renderHarness(file, overrides) {
  const slots = []; let cursor = 0, mounted = false, effect;
  const react = {
    useMemo: fn => fn(), useCallback: fn => fn, useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect: fn => { if (!mounted) effect = fn; },
  };
  const jsx = { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
  const blank = { default: 'placeholder' };
  const sb = overrides.sb;
  const deps = { react, 'react/jsx-runtime': jsx, 'next/link': { default: 'a' },
    '@/lib/supabase/client': { createClient: () => sb }, '@/lib/use-user': { useUser: () => ({ user: { id:'user-a' }, loading:false }) },
    '@/lib/questions': { SUBJECTS: [{ id:'chemistry', label:'Chemistry' }] }, '@/lib/daily': { getDailyDone: overrides.daily ?? (async () => []) },
    '@/lib/rewards': { getSpinStatus: async () => ({can_spin:false,ladder_day:0}), getStreakStatus: async () => ({current:0,freezes:0}), spinDaily: async () => ({}), buyStreakFreeze: async () => 0 },
    '@/lib/quests': { getQuests: async () => [], claimQuest: async () => 0 }, '@/lib/confetti': { celebrate() {} },
    '@/lib/progress': { getMyWeek: overrides.week ?? (async () => { throw Error('offline'); }), leagueTier: () => ({name:'Bronze',emoji:'',next:10}) },
    '@/components/spin-wheel': blank, '@/components/quest-list': blank, '@/components/powerup-shop': blank,
    '@/components/share-button': blank, '@/components/league-badge': blank, '@/components/avatar': blank,
  };
  const Page = loadSourceModule(file, deps).default;
  function render() { cursor = 0; const child = Page(); return child.type(child.props); }
  async function settle() { for (let i=0;i<12;i++) await Promise.resolve(); }
  return { render, mount() { render(); mounted=true; effect?.(); }, settle };
}
function profile(data, error=null) { return { rpc: async () => ({data:null,error:null}), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({data,error}) }) }) }) }; }
for (const failure of ['profile', 'daily']) test(`daily quizzes show unavailable on ${failure} failure rather than false setup or unfinished status`, async () => {
  let calls=0;
  const h=renderHarness('components/today-quizzes.tsx', { sb:profile(failure==='profile'?null:{year:12,subjects:['chemistry']}, failure==='profile'?{message:'denied'}:null), daily:async()=>{calls++;throw Error('offline')} });
  h.mount(); await h.settle(); const content=textContent(h.render());
  assert.match(content,/quizzes are unavailable/i); assert.doesNotMatch(content,/Set up your subjects|0\/1|Play ▶/);
  if(failure==='profile') assert.equal(calls,0);
});
test('daily quizzes still offer setup for a successful missing profile', async () => {
  const h=renderHarness('components/today-quizzes.tsx',{sb:profile(null)});h.mount();await h.settle();assert.match(textContent(h.render()),/Set up your subjects/);
});
for (const data of [null, [], {}, {coins:-1}, {coins:'10'}, {coins:NaN}]) test(`rewards leaves malformed wallet ${String(data)} unknown`, async () => {
  const h=renderHarness('app/rewards/page.tsx',{sb:{rpc:async()=>({data,error:null})}});h.mount();await h.settle();const content=textContent(h.render());assert.match(content,/–\s*✨/);assert.match(content,/Wallet balance is unavailable/);
});
test('rewards accepts a valid zero wallet', async () => {
  const h=renderHarness('app/rewards/page.tsx',{sb:{rpc:async()=>({data:{coins:0},error:null})}});h.mount();await h.settle();const content=textContent(h.render());assert.match(content,/0\s*✨/);assert.doesNotMatch(content,/Wallet balance is unavailable/);
});
test('home statistics retain placeholders when records and league are unavailable',async()=>{
  const h=renderHarness('components/home-stats.tsx',{sb:profile(null)});h.mount();await h.settle();const content=textContent(h.render());assert.match(content,/League unavailable/);assert.doesNotMatch(content,/Bronze League|0 day streak|0 total XP/);assert.match(content,/–/);
});
