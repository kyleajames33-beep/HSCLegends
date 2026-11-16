import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule } from '../support/source-harness.mjs';

// Exercise the actual account-owned components using deferred synthetic reads.
for (const file of ['components/home-stats.tsx', 'components/powerup-shop.tsx', 'components/today-quizzes.tsx', 'app/collection/page.tsx', 'app/rewards/page.tsx']) {
  test(`${file}: account change remounts state and a late read cannot update the retired account`, async () => {
    let user = { id: 'account-a' }, writes = 0, retired = false;
    const effects = [], pending = [];
    const deferred = () => new Promise(resolve => pending.push(resolve));
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: deferred }) }) }), rpc: deferred };
    const react = {
      useMemo: fn => fn(), useCallback: fn => fn, useRef: value => ({ current: value }),
      useState: value => [value, () => { if (retired) writes++; }],
      useEffect: fn => effects.push(fn),
    };
    const jsx = { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }), Fragment: 'fragment' };
    const placeholder = { default: 'placeholder' };
    const deps = {
      react, 'react/jsx-runtime': jsx, 'next/link': { default: 'a' },
      '@/lib/supabase/client': { createClient: () => sb }, '@/lib/use-user': { useUser: () => ({ user, loading: false }) },
      '@/lib/progress': { getMyWeek: deferred, leagueTier: () => ({ name: 'Bronze', emoji: '', next: 10 }) },
      '@/lib/powerups': { getPowerups: deferred, buyPowerup: deferred },
      '@/lib/questions': { SUBJECTS: [] }, '@/lib/daily': { getDailyDone: deferred },
      '@/lib/cards': { getCollection: deferred, openPack: deferred, sellDupe: deferred, RARITY: {}, RARITY_ORDER: [], PACK_COST: 100 },
      '@/lib/rewards': { getSpinStatus: deferred, getStreakStatus: deferred, spinDaily: deferred, buyStreakFreeze: deferred },
      '@/lib/quests': { getQuests: deferred, claimQuest: deferred }, '@/lib/confetti': { celebrate() {} },
      '@/components/share-button': placeholder, '@/components/league-badge': placeholder, '@/components/avatar': placeholder,
      '@/components/tab-bar': placeholder, '@/components/card-tile': placeholder, '@/components/pack-opening': placeholder,
      '@/components/spin-wheel': placeholder, '@/components/quest-list': placeholder, '@/components/powerup-shop': placeholder,
    };
    const Page = loadSourceModule(file, deps).default;
    const first = Page();
    assert.equal(first.key, 'account-a');
    first.type(first.props);
    const cleanups = effects.map(fn => fn());
    assert.ok(pending.length > 0);
    user = { id: 'account-b' };
    assert.equal(Page().key, 'account-b', 'React remounts the account state');
    retired = true; cleanups.forEach(fn => fn?.());
    pending.forEach(resolve => resolve({ data: null, error: null }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(writes, 0);
  });
}

test('power-up shop reports a wallet failure instead of treating it as a zero balance', async () => {
  const effects = [], changes = [];
  const react = {
    useMemo: fn => fn(), useCallback: fn => fn, useRef: value => ({ current: value }),
    useState: value => [value, update => changes.push(update)], useEffect: fn => effects.push(fn),
  };
  const jsx = { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
  const Page = loadSourceModule('components/powerup-shop.tsx', {
    react, 'react/jsx-runtime': jsx,
    '@/lib/supabase/client': { createClient: () => ({ rpc: async () => ({ data: null, error: new Error('wallet unavailable') }) }) },
    '@/lib/use-user': { useUser: () => ({ user: { id: 'account-a' } }) },
    '@/lib/powerups': { getPowerups: async () => [], buyPowerup: async () => {} },
  }).default;
  const child = Page(); child.type(child.props); effects.forEach(fn => fn());
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.ok(changes.includes('wallet unavailable'));
  assert.ok(!changes.includes(0));
});
