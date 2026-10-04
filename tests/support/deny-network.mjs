// Accidental-I/O guard, not a hostile-code security sandbox.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
function refused() { throw new Error('OFFLINE_TEST_NETWORK_REFUSED: Tests must not open a network connection.'); }
for (const transport of [http, https]) { transport.request = refused; transport.get = refused; }
net.connect = refused;
net.createConnection = refused;
net.Socket.prototype.connect = refused;
tls.connect = refused;
globalThis.fetch = refused;
globalThis.WebSocket = class { constructor() { refused(); } };
syncBuiltinESMExports();
