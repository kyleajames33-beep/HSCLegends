import { once } from 'node:events';
import { stagingConfig } from '../../lib/classroom-v2/staging-config.ts';
import { createSeatAuthorizer } from './authorize.mjs';
import { createClashRelay, RELAY_PATH } from './relay.mjs';

const config = stagingConfig(process.env);
if (!config) throw Error('Configure the dedicated classroom staging project first');
const origin = new URL(process.env.CLASSROOM_STAGING_RELAY_ORIGIN ?? '');
if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/'
    || origin.username || origin.password || origin.search || origin.hash) {
  throw Error('Set CLASSROOM_STAGING_RELAY_ORIGIN to the app origin');
}
const port = Number(process.env.CLASSROOM_STAGING_RELAY_PORT ?? '3042');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid relay port');

const relay = createClashRelay({ origin: origin.origin, authorizeSeat: createSeatAuthorizer(config) });
relay.server.listen(port, '127.0.0.1');
await once(relay.server, 'listening');
console.log(`Reactor Clash relay listening on ws://127.0.0.1:${port}${RELAY_PATH}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void relay.close());
