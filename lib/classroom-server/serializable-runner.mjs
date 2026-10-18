// Dependency-free node-postgres-shaped pool adapter. Construction performs no
// connection. The application owns pool configuration, credentials, role policy
// and shutdown; this candidate never creates them or reads environment secrets.
export function createSerializableRunner(pool, { maxRetries = 2, lockTimeoutMs = 2000, statementTimeoutMs = 5000 } = {}) {
  if (typeof pool?.connect !== 'function') throw new TypeError('Missing trusted pool');
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5
      || !Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 1 || lockTimeoutMs > 30000
      || !Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1 || statementTimeoutMs > 60000) {
    throw new TypeError('Invalid transaction bounds');
  }
  return async function runTransaction(fn) {
    for (let attempt = 0; ; attempt++) {
      const client = await pool.connect();
      let began = false, discard = false;
      try {
        await client.query('begin isolation level serializable');
        began = true;
        await client.query("select set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true), set_config('search_path', 'pg_catalog', true)",
          [`${lockTimeoutMs}ms`, `${statementTimeoutMs}ms`]);
        const result = await fn(client);
        await client.query('commit');
        began = false;
        return result;
      } catch (error) {
        if (began) {
          try { await client.query('rollback'); }
          catch { discard = true; }
        } else { discard = true; }
        // Retry only explicit transaction aborts, never network/timeout errors
        // or an uncertain commit. A complete retry rechecks ownership and time.
        if (discard || !['40001', '40P01'].includes(error?.code) || attempt >= maxRetries) throw error;
      } finally {
        client.release(discard);
      }
    }
  };
}
