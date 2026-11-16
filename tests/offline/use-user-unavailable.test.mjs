import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule } from '../support/source-harness.mjs';

function harness(createClient, globals = {}) {
  const slots = []; let cursor = 0, effect, cleanup;
  const react = {
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=initial; return [slots[i], value => { slots[i]=value; }]; },
    useEffect(fn) { if (!effect) effect = fn; },
  };
  const hookUnderTest = loadSourceModule('lib/use-user.ts', { react, './supabase/client': { createClient } }, globals).useUser;
  return {
    render() { cursor=0; return hookUnderTest(); },
    mount() { cleanup=effect(); },
    unmount() { cleanup?.(); },
  };
}

test('missing backend is reported as unavailable instead of throwing or claiming a user', async () => {
  const h = harness(() => { throw new Error('missing config'); });
  assert.equal(h.render().loading, true); h.mount(); await Promise.resolve();
  const result=h.render(); assert.equal(result.loading, false); assert.equal(result.user, null);
  assert.match(result.error, /unavailable/i); h.unmount();
});

test('new sign-in and sign-out events win over a late initial lookup', async () => {
  for (const [event, session, oldUser] of [
    ['SIGNED_IN', { user: { id: 'new-user' } }, null],
    ['SIGNED_OUT', null, { id: 'old-user' }],
  ]) {
    let resolveLookup, authChanged;
    const h = harness(() => ({ auth: {
      getUser: () => new Promise(resolve => { resolveLookup = resolve; }),
      onAuthStateChange: callback => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    } }));
    h.render(); h.mount();
    authChanged(event, session);
    assert.equal(h.render().loading, false);
    resolveLookup({ data: { user: oldUser }, error: null });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(h.render().user?.id ?? null, session?.user?.id ?? null);
    h.unmount();
  }
});

test('fulfilled auth errors distinguish missing sessions from service failure', async () => {
  for (const [name, unavailable] of [['AuthSessionMissingError', false], ['AuthRetryableFetchError', true]]) {
    const h = harness(() => ({ auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: { name } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } }));
    h.render(); h.mount(); await Promise.resolve(); await Promise.resolve();
    assert.equal(h.render().loading, false);
    assert.equal(Boolean(h.render().error), unavailable);
    h.unmount();
  }
});

test('a stalled lookup times out, ignores late success, and recovers on sign-in', async () => {
  let resolveLookup, authChanged, fireTimeout;
  const h = harness(() => ({ auth: {
    getUser: () => new Promise(resolve => { resolveLookup = resolve; }),
    onAuthStateChange: callback => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  } }), { setTimeout: callback => { fireTimeout = callback; return 1; }, clearTimeout() {} });
  h.render(); h.mount();
  authChanged('INITIAL_SESSION', null);
  fireTimeout();
  assert.match(h.render().error, /unavailable/i);
  assert.equal(h.render().loading, false);
  resolveLookup({ data: { user: { id: 'stale' } }, error: null });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.render().user, null);
  authChanged('SIGNED_IN', { user: { id: 'fresh' } });
  assert.equal(h.render().user.id, 'fresh');
  assert.equal(h.render().error, null);
  h.unmount();
});

test('a rejected account lookup settles and unsubscribes safely', async () => {
  let unsubscribed=false, authChanged;
  const h = harness(() => ({ auth: {
    getUser: () => Promise.reject(new Error('offline')),
    onAuthStateChange: callback => { authChanged=callback; return { data: { subscription: { unsubscribe() { unsubscribed=true; } } } }; },
  } }));
  h.render(); h.mount(); for (let i=0; i<4; i++) await Promise.resolve();
  const result=h.render(); assert.equal(result.loading, false); assert.match(result.error, /unavailable/i);
  authChanged('SIGNED_IN', { user: { id: 'synthetic' } });
  assert.equal(h.render().error, null);
  h.unmount(); assert.equal(unsubscribed, true);
});
