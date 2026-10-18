import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerializableRunner } from '../../lib/classroom-server/serializable-runner.mjs';
const error = code => Object.assign(new Error(code), { code });
function poolWith(inject = () => {}) {
  const events = [];
  let connections = 0;
  return { events, get connections() { return connections; }, async connect() {
    const connection = ++connections;
    return { async query(sql, params) { events.push({ connection, sql, params }); await inject(connection, sql); return { rows: [] }; },
      release(discard) { events.push({ connection, release: discard }); } };
  } };
}
test('serializable runner pins client, bounds statements, commits then releases', async () => {
  const pool = poolWith();
  const result = await createSerializableRunner(pool)(async sql => { await sql.query('work'); return 42; });
  assert.equal(result, 42);
  assert.equal(pool.connections, 1);
  assert.match(pool.events[0].sql, /^begin isolation level serializable$/);
  assert.deepEqual(pool.events[1].params, ['2000ms', '5000ms']);
  assert.deepEqual(pool.events.slice(-2), [{ connection: 1, sql: 'commit', params: undefined }, { connection: 1, release: false }]);
});
test('serializable runner retries explicit serialization and deadlock aborts from fresh transactions', async () => {
  const pool = poolWith((n, sql) => { if (sql === 'work' && n <= 2) throw error(n === 1 ? '40001' : '40P01'); });
  let calls = 0;
  const result = await createSerializableRunner(pool)(async sql => { calls++; await sql.query('work'); return calls; });
  assert.equal(result, 3);
  assert.equal(pool.connections, 3);
  assert.equal(pool.events.filter(e => e.sql === 'rollback').length, 2);
});
test('serializable runner never retries uncertain network commit or lock timeout', async () => {
  for (const [stage, code] of [['commit', 'ECONNRESET'], ['work', '55P03'], ['work', '57014']]) {
    const pool = poolWith((n, sql) => { if (sql === stage) throw error(code); });
    await assert.rejects(createSerializableRunner(pool)(sql => sql.query('work')), e => e.code === code);
    assert.equal(pool.connections, 1);
  }
});
test('serializable runner limits retries and discards a client if rollback fails', async () => {
  const busy = poolWith((n, sql) => { if (sql === 'work') throw error('40001'); });
  await assert.rejects(createSerializableRunner(busy, { maxRetries: 1 })(sql => sql.query('work')), e => e.code === '40001');
  assert.equal(busy.connections, 2);
  const broken = poolWith((n, sql) => { if (sql === 'work') throw error('40001'); if (sql === 'rollback') throw error('ECONNRESET'); });
  await assert.rejects(createSerializableRunner(broken)(sql => sql.query('work')), e => e.code === '40001');
  assert.equal(broken.connections, 1);
  assert.deepEqual(broken.events.at(-1), { connection: 1, release: true });
});
