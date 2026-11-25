import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';

export const RELAY_PATH = '/clash';
const AUTH_TIMEOUT_MS = 5000;
const MAX_BUFFERED = 256 * 1024;
const MAX_CONNECTIONS = 256;
const MAX_STUDENTS = 60;
const MAX_SESSION_MS = 15 * 60 * 1000;
const HOST_EVENTS = new Set(['snap', 'roster']);
const ID = /^[a-zA-Z0-9-]{1,80}$/;

function readJoin(packet) {
  if (packet?.type !== 'join' || typeof packet.roomId !== 'string' || !ID.test(packet.roomId)) return null;
  if (packet.playerId !== undefined && (typeof packet.playerId !== 'string' || !ID.test(packet.playerId))) return null;
  if (typeof packet.accessToken !== 'string' || packet.accessToken.length > 8192) return null;
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(packet.accessToken)) return null;
  return { roomId: packet.roomId, playerId: packet.playerId, accessToken: packet.accessToken };
}

function studentPayload(event, payload, playerId, playerToken) {
  const identity = { id: playerId, k: playerToken };
  if (event === 'cancel') return identity;
  if (event === 'begin' && typeof payload?.term === 'string' && ID.test(payload.term)) {
    return { ...identity, term: payload.term };
  }
  if (event !== 'in' || !Number.isFinite(payload?.x) || !Number.isFinite(payload.y)) return null;
  const { x, y, a, f, s, seq, life } = payload;
  return {
    ...identity, x, y,
    a: Number.isFinite(a) ? a : undefined,
    f: f === 1 ? 1 : undefined,
    s: s === 1 ? 1 : undefined,
    seq: Number.isSafeInteger(seq) ? seq : undefined,
    life: Number.isFinite(life) ? life : undefined,
  };
}

function transmit(socket, message, event) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount <= MAX_BUFFERED) socket.send(message);
  else if (event !== 'snap') socket.close(1013, 'Connection is too slow');
}

export function createClashRelay({ origin, authorizeSeat }) {
  const rooms = new Map();
  const server = createServer((_request, response) => { response.writeHead(404).end(); });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const alive = new WeakSet();
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== RELAY_PATH || request.headers.origin !== origin || wss.clients.size >= MAX_CONNECTIONS) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, client => wss.emit('connection', client));
  });

  wss.on('connection', socket => {
    let seat;
    let joining = false;
    let expiry;
    let budget = 45;
    let last = performance.now();
    const authTimeout = setTimeout(() => socket.close(1008, 'Seat verification timed out'), AUTH_TIMEOUT_MS);
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clearTimeout(authTimeout);
      clearTimeout(expiry);
      if (!seat) return;
      const { room, roomId, playerId } = seat;
      if (playerId && room.students.get(playerId) === socket) room.students.delete(playerId);
      if (room.host === socket) room.host = null;
      if (!room.host && room.students.size === 0) rooms.delete(roomId);
    });

    async function join(packet) {
      const request = readJoin(packet);
      if (!request) { socket.close(1008, 'Invalid join'); return; }
      joining = true;
      let member;
      try { member = await authorizeSeat(request); }
      catch { socket.close(1013, 'Seat verification unavailable'); return; }
      if (socket.readyState !== WebSocket.OPEN) return;
      const lifetime = Math.min(MAX_SESSION_MS, member?.expiresAt - Date.now());
      if (!Number.isFinite(lifetime) || lifetime <= 0 || (request.playerId && !member.playerToken)) {
        socket.close(4003, 'Seat not available');
        return;
      }

      const { roomId, playerId } = request;
      const room = rooms.get(roomId) ?? { host: null, students: new Map() };
      const previous = playerId ? room.students.get(playerId) : room.host;
      if (playerId && !previous && room.students.size >= MAX_STUDENTS) {
        socket.close(1013, 'Room is full');
        return;
      }
      rooms.set(roomId, room);
      seat = { room, roomId, playerId, playerToken: member.playerToken };
      if (playerId) room.students.set(playerId, socket);
      else room.host = socket;
      previous?.close(4009, 'Seat connected elsewhere');
      clearTimeout(authTimeout);
      expiry = setTimeout(() => socket.close(4001, 'Verify seat again'), lifetime);
      socket.send('{"type":"joined"}');
    }

    socket.on('message', (data, binary) => {
      const now = performance.now();
      budget = Math.min(45, budget + ((now - last) * 30) / 1000);
      last = now;
      if (binary || budget < 1 || socket.readyState !== WebSocket.OPEN) return;
      budget -= 1;
      let packet;
      try { packet = JSON.parse(data.toString()); } catch { return; }
      if (!seat) {
        if (!joining) void join(packet);
        return;
      }
      if (packet?.type !== 'event') return;
      const { room, playerId, playerToken } = seat;
      const { event, payload } = packet;
      if (playerId) {
        if (room.students.get(playerId) !== socket) return;
        const controls = studentPayload(event, payload, playerId, playerToken);
        if (controls) transmit(room.host, JSON.stringify({ type: 'event', event, payload: controls }), event);
      } else if (room.host === socket && HOST_EVENTS.has(event) && payload && typeof payload === 'object') {
        const update = JSON.stringify({ type: 'event', event, payload });
        for (const student of room.students.values()) transmit(student, update, event);
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.delete(socket)) socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }, 20_000);
  heartbeat.unref();
  return {
    server,
    async close() {
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      await Promise.all([
        new Promise(resolve => wss.close(resolve)),
        new Promise(resolve => server.close(resolve)),
      ]);
    },
  };
}
