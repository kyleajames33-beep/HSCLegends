// Actual Next.js screens and Realtime client, with a loopback-only Supabase double.
import assert from 'node:assert/strict';

const base = new URL(process.env.HSC_BASE_URL ?? 'http://127.0.0.1:3000');
assert.ok(base.protocol === 'http:' && base.hostname === '127.0.0.1', 'Use a local Next.js dev server');
const backend = 'http://127.0.0.1:54321';
const room = 'test-clash-room';
const roster = [];
const sockets = new Map();
const disconnects = [];
const pageErrors = [];
const receipts = [];
let roomState = 'lobby';
let dropAdaSnapshots = false;
let holdLobbyView;
let dropTerminalBegin = false;
let terminalBegins = 0;
let issuedQuestions = 0;
let releaseReceipts = false;

const { chromium } = await import(process.env.HSC_PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch();
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

function relay(socket, raw) {
  if (typeof raw === 'string') {
    const [joinRef, ref, topic, event] = JSON.parse(raw);
    if (event === 'phx_join') socket.topic = topic;
    if (event === 'phx_leave') {
      disconnects.push(socket.name);
      socket.topic = null;
    }
    if (ref) socket.ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
    return;
  }

  assert.equal(raw[0], 3, 'Expected a Realtime broadcast');
  const [, joinSize, refSize, topicSize, eventSize, metaSize, encoding] = raw;
  assert.equal(encoding, 1, 'Expected JSON broadcast data');
  const topicStart = 7 + joinSize + refSize;
  const eventStart = topicStart + topicSize;
  const metaStart = eventStart + eventSize;
  const topic = raw.toString('utf8', topicStart, eventStart);
  const event = raw.toString('utf8', eventStart, metaStart);
  const payload = JSON.parse(raw.toString('utf8', metaStart + metaSize));
  if (event === 'begin') {
    terminalBegins++;
    if (dropTerminalBegin) return;
  }
  const packet = JSON.stringify([null, null, topic, 'broadcast', { type: 'broadcast', event, payload }]);
  for (const peer of sockets.values()) {
    if (peer === socket || peer.topic !== topic || (dropAdaSnapshots && peer.name === 'Ada' && event === 'snap')) continue;
    peer.ws.send(packet);
  }
}

async function openPage(name, role, path) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const user = { id: name, aud: 'authenticated', role: 'authenticated', is_anonymous: role === 'player' };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: name, role: user.role, exp })}.test`;
  const session = { access_token: token, refresh_token: 'mock', expires_at: exp, user };
  await context.addInitScript(({ name, role, session }) => {
    sessionStorage.setItem(`hsc-live-local-${role}`, JSON.stringify(session));
    localStorage.setItem(`hsc-live-sound-clash-${role}`, '0');
    if (name === 'Teacher') {
      window.clashWorkersStarted = 0;
      window.Worker = class extends Worker {
        constructor(...args) {
          super(...args);
          if (String(args[0]).includes('clash-clock')) window.clashWorkersStarted++;
        }
      };
    }
  }, { name, role, session });
  await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
  await context.route(`${backend}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: user });
    const rpc = url.pathname.split('/').at(-1);
    const args = route.request().postDataJSON();
    let result;
    switch (rpc) {
      case 'classroom_v2_set_list': result = []; break;
      case 'clash_receipts': result = releaseReceipts ? receipts.filter(r => r.seq > args.p_since) : []; break;
      case 'clash_create': result = [{ room_id: room, short_code: 'T6HXHV' }]; break;
      case 'clash_host_view': {
        result = { room_id: room, short_code: 'T6HXHV', state: roomState, seconds: 180, players: roster };
        if (holdLobbyView && !holdLobbyView.captured && roomState === 'lobby') {
          const hold = holdLobbyView;
          hold.captured = true;
          hold.arrived.resolve();
          await hold.release.promise;
        }
        break;
      }
      case 'clash_start': roomState = 'active'; result = true; break;
      case 'clash_join': {
        const team = name === 'Ada' ? 'blue' : 'orange';
        const token = `test-${name}`;
        roster.push({ id: name, alias: args.p_alias, team, token });
        result = [{ room_id: room, player_id: name, team, token }];
        break;
      }
      case 'clash_me': result = { state: roomState, seconds: 180, alias: name, team: roster.find(p => p.id === name)?.team, answered: 0, correct: 0 }; break;
      case 'clash_question':
        result = { issue_id: `test-issue-${++issuedQuestions}`, stem: 'Which option is correct?', options: ['First', 'Second'] };
        break;
      case 'clash_answer': {
        const correct = args.p_choice === 0;
        receipts.push({ seq: receipts.length + 1, player_id: args.p_player, correct });
        result = { correct, choice: args.p_choice, correct_index: 0, explanation: null };
        break;
      }
      default: throw Error(`Unexpected test endpoint ${url.pathname}`);
    }
    await route.fulfill({ json: result });
  });
  await context.routeWebSocket('**/*', ws => {
    const url = new URL(ws.url());
    if (url.origin === base.origin.replace('http:', 'ws:')) { ws.connectToServer(); return; }
    if (url.origin !== 'ws://127.0.0.1:54321') return ws.close();
    const socket = { name, ws, topic: null };
    sockets.set(ws, socket);
    ws.onMessage(raw => relay(socket, raw));
    ws.onClose(() => sockets.delete(ws));
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(`${name}: ${error.message}`));
  await page.goto(new URL(path, base).href);
  return page;
}

try {
  const host = await openPage('Teacher', 'host', '/clash/host');
  await host.getByLabel(/Boss for the final minute/).selectOption('physics');
  await host.getByRole('checkbox').uncheck();
  await host.getByRole('button', { name: 'Create match' }).click();
  await host.getByText('T6HXHV', { exact: true }).waitFor();

  const [ada, ben] = await Promise.all(['Ada', 'Ben'].map(async name => {
    const page = await openPage(name, 'player', '/clash/join?code=T6HXHV');
    await page.getByPlaceholder('Nickname').fill(name);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.getByText(new RegExp(`${name}, you're on`)).waitFor();
    return page;
  }));
  await host.getByRole('button', { name: 'Ada', exact: true }).waitFor();
  await host.getByRole('button', { name: 'Ben', exact: true }).waitFor();
  await ada.getByText('Team: Ada', { exact: true }).waitFor();
  await ben.getByText('Team: Ben', { exact: true }).waitFor();
  assert.deepEqual(disconnects, [], 'The room theme must not replace student subscriptions');

  const delayedPoll = { arrived: Promise.withResolvers(), release: Promise.withResolvers() };
  holdLobbyView = delayedPoll;
  const pendingPoll = host.waitForRequest(request => request.url().endsWith('/clash_host_view'));
  await pendingPoll;
  await delayedPoll.arrived.promise;
  await host.getByRole('button', { name: 'Start match' }).click();
  await Promise.all([ada, ben].map(page => page.locator('canvas').waitFor()));
  await host.waitForFunction(() => window.__clashHost.t > 0.3 && window.clashWorkersStarted === 1);
  const oldLobbyResponse = host.waitForResponse(async response => response.url().endsWith('/clash_host_view') && (await response.json()).state === 'lobby');
  const beforePoll = await host.evaluate(() => window.__clashHost.t);
  delayedPoll.release.resolve();
  await oldLobbyResponse;
  await host.waitForFunction(t => window.__clashHost.t > t + 0.3, beforePoll);
  assert.equal(await host.evaluate(() => window.clashWorkersStarted), 1, 'A late lobby response must not restart the projector clock');

  await host.getByRole('button', { name: 'Sound off' }).click();
  await ada.getByRole('button', { name: 'Sound off' }).click();
  await host.getByRole('button', { name: 'Sound on' }).waitFor();
  await ada.getByRole('button', { name: 'Sound on' }).waitFor();
  const start = await host.evaluate(() => window.__clashHost.t);
  await host.waitForFunction(t => window.__clashHost.t > t + 0.3, start);
  assert.equal(await host.evaluate(() => window.clashWorkersStarted), 1, 'Sound preference must not restart the projector clock');
  assert.deepEqual(disconnects, [], 'Sound preference must not replace student subscriptions');

  const y = await host.evaluate(() => window.__clashHost.players.Ada.y);
  await ada.bringToFront();
  await ada.keyboard.down('s');
  await host.waitForFunction(y => window.__clashHost.players.Ada.y > y + 45, y);
  await ada.keyboard.up('s');
  dropAdaSnapshots = true;
  const waiting = ada.getByRole('status').filter({ hasText: 'Waiting for the projector' });
  await waiting.waitFor();
  const stopped = await ada.evaluate(() => window.__clashLocal.y);
  await ada.keyboard.down('s');
  await ada.waitForTimeout(250);
  await ada.keyboard.up('s');
  assert.equal(await ada.evaluate(() => window.__clashLocal.y), stopped, 'Prediction must pause without fresh snapshots');

  dropAdaSnapshots = false;
  await waiting.waitFor({ state: 'hidden' });
  const afterGap = await host.evaluate(() => window.__clashHost.players.Ada.y);
  await ada.keyboard.down('s');
  await host.waitForFunction(y => window.__clashHost.players.Ada.y > y + 45, afterGap);
  await ada.keyboard.up('s');

  const terminal = await host.evaluate(() => {
    const g = window.__clashHost, terminal = g.terminals[0];
    Object.assign(g.players.Ada, { x: terminal.x + 14, y: terminal.y + 14, energy: 35 });
    return terminal;
  });
  await ada.evaluate(terminal => Object.assign(window.__clashLocal, { x: terminal.x + 14, y: terminal.y + 14 }), terminal);
  await ada.getByText('Press E to answer for energy').waitFor();

  dropTerminalBegin = true;
  await ada.keyboard.press('e');
  await ada.waitForTimeout(350);
  assert.equal(terminalBegins, 1, 'Student attempted to start a terminal question');
  assert.equal(issuedQuestions, 0, 'A dropped terminal request must not issue a question');

  dropTerminalBegin = false;
  await ada.keyboard.press('e');
  const question = ada.getByRole('dialog', { name: 'Answer for energy' });
  await question.waitFor();
  assert.equal(await host.evaluate(() => window.__clashHost.players.Ada.answering), terminal.id);
  const lockedEnergy = await host.evaluate(() => window.__clashHost.players.Ada.energy);
  await question.getByRole('button', { name: '1 First' }).click();
  await ada.waitForTimeout(950);
  assert.ok(await question.isVisible(), 'Feedback must remain visible until the projector processes the receipt');
  assert.equal(issuedQuestions, 1, 'An in-flight receipt must not trigger another question');
  assert.equal(await host.evaluate(() => window.__clashHost.players.Ada.energy), lockedEnergy);
  releaseReceipts = true;
  await question.waitFor({ state: 'detached' });
  assert.equal(await host.evaluate(() => window.__clashHost.players.Ada.stats.answered), 1);
  const refuelledEnergy = await host.evaluate(() => window.__clashHost.players.Ada.energy);
  assert.ok(refuelledEnergy - lockedEnergy >= 25 - 0.01, 'The confirmed answer refuelled the student');

  await ada.getByText('Press E to answer for energy').waitFor();
  await ada.keyboard.press('e');
  await question.waitFor();
  await ada.keyboard.press('Escape');
  await question.waitFor({ state: 'detached' });
  await ada.getByText('Press E to answer for energy').waitFor();
  assert.equal(issuedQuestions, 2, 'Closing a terminal question must not immediately reopen it');

  await host.evaluate(() => { window.__clashHost.players.Ben.energy = 0; });
  const emergency = ben.getByRole('dialog', { name: 'Out of energy' });
  await emergency.getByRole('button', { name: '2 Second' }).click();
  await emergency.getByRole('status').filter({ hasText: 'Another question is coming' }).waitFor();
  await emergency.getByRole('button', { name: '1 First' }).click();
  await emergency.waitFor({ state: 'detached' });
  assert.equal(await host.evaluate(() => window.__clashHost.players.Ben.stats.answered), 2);
  assert.equal(await host.evaluate(() => window.__clashHost.players.Ben.energy), 15);
  assert.deepEqual(pageErrors, []);
  console.log('Reactor Clash multiplayer smoke passed: stable clock and subscriptions, snapshot recovery, terminal receipts, and emergency retry.');
} finally {
  holdLobbyView?.release.resolve();
  await browser.close();
}
