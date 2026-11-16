import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import { loadSourceModule } from '../support/source-harness.mjs';

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('animation loading cannot replace a newer source with a late response', async () => {
  let state = null, previous, cleanup;
  const requests = [];
  const react = {
    useState() { return [state, value => { state = value; }]; },
    useEffect(effect, deps) {
      if (previous && deps[0] === previous[0]) return;
      cleanup?.(); previous = deps; cleanup = effect();
    },
  };
  const fetch = (url, { signal }) => { const result = deferred(); requests.push({ url, signal, ...result }); return result.promise; };
  const Box = loadSourceModule('components/lottie-box.tsx', {
    react, 'react/jsx-runtime': jsx, 'lottie-react': { default: 'lottie' },
    '@/lib/lotties': { LOTTIES: { stars: { frame: 'bundled' } } },
  }, { fetch, AbortController }).default;
  assert.equal(Box({ src: 'first' }), null);
  assert.equal(Box({ src: 'second' }), null);
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve({ ok: true, json: async () => ({ frame: 'old' }) });
  requests[1].resolve({ ok: true, json: async () => ({ frame: 'new' }) });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(Box({ src: 'second' }).props.animationData.frame, 'new');
  assert.equal(Box({ name: 'stars' }).props.animationData.frame, 'bundled');
  cleanup?.();
});
