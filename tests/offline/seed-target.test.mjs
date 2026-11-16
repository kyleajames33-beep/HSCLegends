import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { seedTarget } from '../../scripts/lib/seed-target.mjs';

const shared = 'https://rerfrskojieacxthfavb.supabase.co';
test('seed targets require an explicit safe URL and guard the known shared project', () => {
  assert.equal(seedTarget('https://staging.example.test/'), 'https://staging.example.test/rest/v1/questions');
  assert.equal(seedTarget('http://127.0.0.1:54321'), 'http://127.0.0.1:54321/rest/v1/questions');
  for (const raw of ['', 'not-a-url', 'http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test/?token=secret', 'https://example.test/#fragment']) {
    assert.throws(() => seedTarget(raw), /SEED_TARGET/);
  }
  assert.throws(() => seedTarget(shared), /shared production/);
  assert.throws(() => seedTarget('https://rerfrskojieacxthfavb.supabase.co.'), /shared production/);
  assert.equal(seedTarget(shared, { allowSharedProduction: true }), `${shared}/rest/v1/questions`);
});

test('seed CLI validates locally by default even with credentials and a production target present', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hsc-seed-test-'));
  const input = join(dir, 'questions.json');
  try {
    await writeFile(input, JSON.stringify([{ id: 'synthetic-1', stem: 'Test' }]));
    const run = (args, env = {}) => spawnSync(process.execPath, ['--import', './tests/support/deny-network.mjs', 'scripts/seed-rest.mjs', '--input', input, ...args], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, SUPABASE_URL: shared, SUPABASE_SERVICE_KEY: 'synthetic-key', ...env },
    });
    const dry = run([]);
    assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /Dry run only; no database requests sent/);
    const blocked = run(['--apply']);
    assert.notEqual(blocked.status, 0); assert.match(blocked.stderr, /shared production/);
    assert.doesNotMatch(blocked.stderr, /synthetic-key/);
    const missingTarget = run(['--apply'], { SUPABASE_URL: '' });
    assert.notEqual(missingTarget.status, 0); assert.match(missingTarget.stderr, /SUPABASE_URL/);
    const missingKey = run(['--apply'], { SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_KEY: '' });
    assert.notEqual(missingKey.status, 0); assert.match(missingKey.stderr, /SUPABASE_SERVICE_KEY/);
    const explicit = run(['--apply', '--allow-shared-production']);
    assert.notEqual(explicit.status, 0); assert.match(explicit.stderr, /OFFLINE_TEST_NETWORK_REFUSED/);
    assert.doesNotMatch(explicit.stderr, /synthetic-key/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
