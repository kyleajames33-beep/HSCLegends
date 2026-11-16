import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSourceModule } from '../support/source-harness.mjs';

function component(renderToString) {
  return loadSourceModule('components/math-text.tsx', {
    'react/jsx-runtime': jsx,
    'katex/dist/katex.min.css': {},
    katex: { default: { renderToString } },
  }).default;
}

test('math renderer isolates expressions and escapes the fallback when rendering fails', () => {
  const calls = [];
  const MathText = component((tex, options) => {
    calls.push([tex, options.displayMode]);
    if (tex.startsWith('<')) throw new Error('Invalid math');
    return `<i>${tex}</i>`;
  });
  const html = renderToStaticMarkup(jsx.jsx(MathText, { text: 'Try $x$ and $$y$$, then $<img src=x onerror=alert(1)>$.' }));
  assert.deepEqual(calls, [['x', false], ['y', true], ['<img src=x onerror=alert(1)>', false]]);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.match(renderToStaticMarkup(jsx.jsx(MathText, { text: 'Plain text' })), /Plain text/);
});
