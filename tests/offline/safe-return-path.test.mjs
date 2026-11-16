import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule } from '../support/source-harness.mjs';

const { safeReturnPath } = loadSourceModule('lib/safe-return-path.ts');

test('login only returns to an application-relative destination', () => {
  for (const value of [null, '', 'https://example.com', '//example.com', '/\\example.com', '/\n/example.com', 'javascript:alert(1)']) {
    assert.equal(safeReturnPath(value), '/');
  }
  for (const value of ['/', '/games', '/join?code=123456', '/profile#stats']) {
    assert.equal(safeReturnPath(value), value);
  }
});
