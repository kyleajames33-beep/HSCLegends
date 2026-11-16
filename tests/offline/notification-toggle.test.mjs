import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSourceModule } from '../support/source-harness.mjs';

test('reminder control is an accessible switch and ignores a late subscription read after unmount', async () => {
  let settle, cleanup, writes = 0;
  const pending = new Promise(resolve => { settle = resolve; });
  const react = {
    useMemo: fn => fn(),
    useState: initial => [initial, () => { writes++; }],
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useEffect: effect => { cleanup = effect(); },
  };
  const Component = loadSourceModule('components/notification-toggle.tsx', {
    react, 'react/jsx-runtime': jsx,
    '@/lib/supabase/client': { createClient: () => ({}) },
    '@/lib/use-user': { useUser: () => ({ user: { id: 'synthetic' } }) },
    '@/lib/push': { pushSupported: () => true, currentSubscription: () => pending, subscribePush() {}, unsubscribePush() {} },
  }).default;
  const html = renderToStaticMarkup(Component());
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked="false"/);
  assert.match(html, /aria-label="Streak and boss reminders"/);
  cleanup(); settle(true);
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.equal(writes, 0);
});
