import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { createSeatAuthorizer } from './authorize.mjs';
import { createClashRelay, RELAY_PATH } from './relay.mjs';

const appOrigin = 'http://127.0.0.1:3000';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const expiry = Math.floor(Date.now() / 1000) + 3600;
const tokenFor = (role, id, exp = expiry) => `fixture.${encode({ role, id, exp })}.signature`;

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function setup(t) {
  const backend = createServer(async (request, response) => {
    assert.equal(request.headers.apikey, 'test-public-key');
    const token = request.headers.authorization?.slice('Bearer '.length);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const args = JSON.parse(Buffer.concat(chunks));
    const { role, id } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
    let view;
    if (role === 'host' && request.url === '/rest/v1/rpc/clash_host_view' && args.p_room === id) {
      view = { room_id: args.p_room, state: 'active' };
    } else if (role === 'student' && request.url === '/rest/v1/rpc/clash_me' && id === `${args.p_room}-${args.p_player}`) {
      view = { state: 'active', token: `verified-${args.p_player}` };
    }
    response.writeHead(view ? 200 : 403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(view ?? {}));
  });
  const backendPort = await listen(backend);
  const authorizeSeat = createSeatAuthorizer({ url: `http://127.0.0.1:${backendPort}`, publicKey: 'test-public-key' });
  const relay = createClashRelay({ origin: appOrigin, authorizeSeat });
  const url = `ws://127.0.0.1:${await listen(relay.server)}${RELAY_PATH}`;
  t.after(async () => {
    await relay.close();
    await new Promise(resolve => backend.close(resolve));
  });

  async function open(join, origin = appOrigin) {
    const socket = new WebSocket(url, { origin });
    const packets = [];
    socket.on('message', data => packets.push(JSON.parse(data)));
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'join', ...join }));
    return { socket, packets };
  }

  async function connect(join) {
    const peer = await open(join);
    await until(() => peer.packets[0]?.type === 'joined');
    return peer;
  }
  return { open, connect };
}

async function until(condition) {
  for (let i = 0; i < 300; i++) {
    if (condition()) return;
    await sleep(10);
  }
  assert.ok(condition(), 'Timed out waiting for a relay event');
}

function send(peer, event, payload) {
  peer.socket.send(JSON.stringify({ type: 'event', event, payload }));
}

test('relay checks seat ownership and routes only allowed messages within each room', async t => {
  const { open, connect } = await setup(t);
  await assert.rejects(open({ roomId: 'room-a' }, 'https://other.example'), /403/);
  const denied = await open({ roomId: 'room-a', accessToken: tokenFor('student', 'room-a-ada') });
  assert.equal((await once(denied.socket, 'close'))[0], 4003);
  const foreign = await open({ roomId: 'room-a', playerId: 'ben', accessToken: tokenFor('student', 'room-a-ada') });
  assert.equal((await once(foreign.socket, 'close'))[0], 4003);
  const expired = await open({ roomId: 'room-a', accessToken: tokenFor('host', 'room-a', 1) });
  assert.equal((await once(expired.socket, 'close'))[0], 4003);
  const teacher = await connect({ roomId: 'room-a', accessToken: tokenFor('host', 'room-a') });
  const otherTeacher = await connect({ roomId: 'room-b', accessToken: tokenFor('host', 'room-b') });
  const ada = await connect({ roomId: 'room-a', playerId: 'ada', accessToken: tokenFor('student', 'room-a-ada') });
  const ben = await connect({ roomId: 'room-a', playerId: 'ben', accessToken: tokenFor('student', 'room-a-ben') });
  const eve = await connect({ roomId: 'room-b', playerId: 'eve', accessToken: tokenFor('student', 'room-b-eve') });
  send(ada, 'snap', { t: 1 });
  send(ada, 'in', { id: 'ben', k: 'untrusted', seq: 8, x: 10, y: 10, unexpected: true });
  send(teacher, 'in', { x: 12, y: 12 });
  send(teacher, 'snap', { t: 2 });
  await until(() => ada.packets.length === 2 && ben.packets.length === 2 && teacher.packets.length === 2);
  assert.deepEqual(teacher.packets[1], { type: 'event', event: 'in', payload: { id: 'ada', k: 'verified-ada', x: 10, y: 10, seq: 8 } });
  assert.deepEqual(ada.packets, ben.packets);
  assert.deepEqual(ben.packets[1], { type: 'event', event: 'snap', payload: { t: 2 } });
  assert.equal(otherTeacher.packets.length, 1);
  assert.equal(eve.packets.length, 1);

  const oldSeatClosed = once(ada.socket, 'close');
  const replacement = await connect({ roomId: 'room-a', playerId: 'ada', accessToken: tokenFor('student', 'room-a-ada') });
  assert.equal((await oldSeatClosed)[0], 4009);
  send(replacement, 'begin', { term: 't1' });
  await until(() => teacher.packets.length === 3);
  assert.deepEqual(teacher.packets[2].payload, { id: 'ada', k: 'verified-ada', term: 't1' });
});

test('30 students receive every snapshot and only the teacher receives their controls', async t => {
  const { connect } = await setup(t);
  const roomId = 'classroom';
  const teacher = await connect({ roomId, accessToken: tokenFor('host', roomId) });
  const students = await Promise.all(Array.from({ length: 30 }, (_, i) => {
    const playerId = `student-${i}`;
    return connect({ roomId, playerId, accessToken: tokenFor('student', `${roomId}-${playerId}`) });
  }));

  const durationMs = 6000;
  const snapshotTicks = 60;
  const inputTicks = 72;
  const startTime = performance.now();
  await Promise.all([
    (async () => {
      for (let tick = 1; tick <= snapshotTicks; tick++) {
        await sleep(Math.max(0, startTime + tick * durationMs / snapshotTicks - performance.now()));
        send(teacher, 'snap', { t: tick / 10, p: students.map((_, i) => [`student-${i}`, i + tick, tick, 0, 0, 1, -1, 95, 0, 0, []]) });
      }
    })(),
    (async () => {
      for (let tick = 1; tick <= inputTicks; tick++) {
        await sleep(Math.max(0, startTime + tick * durationMs / inputTicks - performance.now()));
        for (const student of students) send(student, 'in', { x: tick, y: tick, seq: tick });
      }
    })(),
  ]);

  await until(() => teacher.packets.length >= 1 + students.length * inputTicks
    && students.every(student => student.packets.length >= 1 + snapshotTicks));
  assert.ok(teacher.packets.slice(1).every(packet => packet.event === 'in'));
  for (const student of students) {
    assert.equal(student.packets.length, 1 + snapshotTicks);
    assert.ok(student.packets.slice(1).every(packet => packet.event === 'snap'));
  }
  const studentControls = teacher.packets.length - 1;
  const snapshotDeliveries = snapshotTicks * students.length;
  assert.equal(studentControls, 2160);
  assert.equal(snapshotDeliveries, 1800);
  t.diagnostic(`${studentControls} controls and ${snapshotDeliveries} snapshot deliveries over ${durationMs / 1000}s`);
});
