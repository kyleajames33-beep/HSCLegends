import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceFunction } from '../support/source-harness.mjs';

for (const [mode, label] of [['knockout', 'Knockout'], ['gamble', 'Gamble']]) {
  test(`${label} explains unavailable server permissions without masking other failures`, () => {
    const message = loadSourceFunction(`app/${mode}/page.tsx`, 'msg');
    assert.match(message(new Error(`permission denied for function ${mode === 'knockout' ? 'ko' : mode}_join`)), /currently unavailable/i);
    assert.equal(message(new Error('Connection lost')), 'Connection lost');
  });
}
