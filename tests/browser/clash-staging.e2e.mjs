// Reactor Clash multiplayer end-to-end against the REAL staging project.
// One projector and two students. HSC_TEST_TAB_VISIBILITY=1 runs the real-tab regression in headed Chromium.
// Requires the dev server (with CLASSROOM_STAGING_* settings) and a host session
// file for an account in classroom_v2_private.hosts:
//   HSC_PLAYWRIGHT_MODULE=<playwright/index.mjs> HSC_HOST_SESSION=<file> node tests/browser/clash-staging.e2e.mjs
import fs from 'node:fs';

const { chromium } = await import(process.env.HSC_PLAYWRIGHT_MODULE ?? 'playwright');
const BASE = process.env.HSC_BASE_URL ?? 'http://localhost:3000';
const REF = process.env.CLASSROOM_STAGING_PROJECT_REF ?? 'xkqeigruzvnudtnmggis';
const SHOTS = process.env.HSC_SCREENSHOT_DIR;
const session = JSON.parse(fs.readFileSync(process.env.HSC_HOST_SESSION, 'utf8')).session;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/clash-${name}.png` }); };
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };

const realTabs = process.env.HSC_TEST_TAB_VISIBILITY === '1';
const browser = await chromium.launch(realTabs ? {
  headless: false,
  ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
} : {});
const errors = [];
const ctx = async (opts = {}) => { const c = await browser.newContext({ viewport: { width: 1366, height: 768 }, ...opts }); return c; };
const watch = page => { page.on('pageerror', e => errors.push(e.message)); return page; };

try {
  // Projector
  const hostCtx = await ctx();
  await hostCtx.addInitScript(([key, value]) => sessionStorage.setItem(key, value), [`hsc-live-${REF}-host`, JSON.stringify(session)]);
  const host = watch(await hostCtx.newPage());
  if (realTabs) {
    // Playwright 1.48 enables focus emulation on its own Chromium session. A new
    // CDP session cannot release that override. Verify the actual visibility below.
    await host._toImpl()._delegate._mainFrameSession._client.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await hostCtx.addInitScript(() => localStorage.setItem('hsc-live-sound-clash-host', '0'));
  }
  await host.goto(`${BASE}/clash/host`);
  if (realTabs) await host.getByRole('checkbox').uncheck();
  await host.getByRole('button', { name: 'Create match' }).click();
  const codeEl = host.locator('p').filter({ hasText: /^[A-HJKMNP-Z2-9]{6}$/ }).first();
  await codeEl.waitFor({ timeout: 20000 });
  const code = (await codeEl.textContent()).trim();
  ok(/^[A-HJKMNP-Z2-9]{6}$/.test(code), `match created with code ${code}`);

  // Two students
  const students = [];
  const arrivals = [];
  for (const name of ['Ada', 'Ben']) {
    const page = watch(await (realTabs && name === 'Ben' ? hostCtx : await ctx()).newPage());
    if (realTabs && name === 'Ada') page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
      // Compact snapshots contain the shots array in both JSON and binary Realtime envelopes.
      if (payload.toString().includes('"sh":[')) arrivals.push(performance.now());
    }));
    await page.goto(`${BASE}/clash/join?code=${code}`);
    await page.getByPlaceholder('Nickname').fill(name);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.getByText("you're on", { exact: false }).waitFor({ timeout: 20000 });
    students.push(page);
  }
  ok(await until(async () => (await host.locator('button', { hasText: /^(Ada|Ben)$/ }).count()) === 2), 'both students appear in the lobby');
  await shot(host, 'lobby');

  await host.bringToFront();
  await host.getByRole('button', { name: 'Start match' }).click();
  ok(await until(() => host.evaluate(() => !!window.__clashHost)), 'match running on the projector');
  const [ada, ben] = students;
  await ada.locator('canvas').waitFor({ timeout: 20000 });
  ok(true, 'students switched to the game view');

  const hostPlayer = name => host.evaluate(n => { const g = window.__clashHost; const p = Object.values(g.players).find(x => x.name === n); return p && { id: p.id, x: p.x, y: p.y, team: p.team, energy: p.energy, answered: p.stats.answered, answering: p.answering, remote: !!p.remote }; }, name);
  const a0 = await hostPlayer('Ada');
  ok(a0 && a0.remote, `Ada is in the host simulation on ${a0?.team}`);

  if (realTabs) {
    const measure = async (tab, visibility, player, name, key) => {
      await tab.bringToFront();
      const visible = await host.evaluate(() => document.visibilityState);
      if (visible !== visibility) throw Error(`Expected ${visibility} projector, observed ${visible}`);
      const start = await host.evaluate(() => window.__clashHost.t);
      const before = await hostPlayer(name);
      const since = performance.now();
      await player.keyboard.down(key);
      await player.waitForTimeout(600);
      await player.keyboard.up(key);
      await player.waitForTimeout(2400);
      const after = await hostPlayer(name);
      const local = await player.evaluate(() => ({ x: window.__clashLocal.x, y: window.__clashLocal.y }));
      const elapsed = (performance.now() - since) / 1000;
      const simulation = (await host.evaluate(() => window.__clashHost.t)) - start;
      const samples = arrivals.filter(at => at >= since);
      const edges = [since, ...samples, performance.now()];
      const gap = Math.max(...edges.slice(1).map((at, i) => at - edges[i]));
      ok(Math.abs(elapsed - simulation) < 0.35, `${visibility} projector advanced ${simulation.toFixed(2)}s in ${elapsed.toFixed(2)}s`);
      ok(samples.length >= elapsed * 5 && gap < 800, `${visibility} projector delivered ${samples.length} snapshots, largest gap ${Math.round(gap)}ms`);
      ok(Math.abs(after.y - before.y) > 45 && Math.hypot(after.x - local.x, after.y - local.y) < 4,
        `${name} moved ${Math.round(after.y - before.y)}px and held position with the projector ${visibility}`);
      ok(await host.evaluate(() => document.visibilityState) === visibility, `projector stayed ${visibility} during movement`);
    };
    await measure(host, 'visible', ada, 'Ada', 's');
    await ben.bringToFront();
    await ben.waitForTimeout(31000); // Pass Chromium's recent-audio grace period.
    await measure(ben, 'hidden', ben, 'Ben', 's');

    // Interrupt the worker while the student's browser and the host watchdog still run.
    const [clock] = host.workers();
    if (!clock) throw Error('Projector clock worker missing');
    const beforeStall = await host.evaluate(() => ({ t: window.__clashHost.t, at: performance.now() }));
    await clock.evaluate(() => { self.resumeTick = self.onmessage; self.onmessage = () => {}; });
    const startX = await ben.evaluate(() => window.__clashLocal.x);
    await ben.keyboard.down('a'); await ben.waitForTimeout(1120); await ben.keyboard.up('a');
    const predictedX = await ben.evaluate(() => window.__clashLocal.x);
    ok(startX - predictedX > 140, 'held movement continues beyond the old snap distance before the timeout');
    const waiting = ben.getByText('Waiting for the projector…');
    await waiting.waitFor();
    await host.getByText('Projector paused.', { exact: false }).waitFor({ state: 'attached' });
    const position = await ben.evaluate(() => window.__clashLocal.x);
    await ben.keyboard.down('a'); await ben.waitForTimeout(450); await ben.keyboard.up('a');
    ok(await ben.evaluate(() => window.__clashLocal.x) === position, 'prediction waits when snapshots stop');
    await clock.evaluate(() => { self.onmessage = self.resumeTick; self.onmessage({ data: false }); });
    await waiting.waitFor({ state: 'detached' });
    await host.getByText('Projector paused.', { exact: false }).waitFor({ state: 'detached' });
    const drift = await host.evaluate(before => (performance.now() - before.at) / 1000 - (window.__clashHost.t - before.t), beforeStall);
    ok(Math.abs(drift) < 0.25, `student and projector recovered, clock caught up within ${Math.round(Math.abs(drift) * 1000)}ms`);
    ok(await until(async () => Math.abs((await hostPlayer('Ben')).x - predictedX) < 5, 3000),
      'projector accepted the late move after catch-up');
    await ben.waitForTimeout(500);
    ok(Math.abs(await ben.evaluate(() => window.__clashLocal.x) - predictedX) < 5, 'student kept the move after reconciliation');
    await host.bringToFront();
  }

  // Movement: Ada walks; the projector sees her move.
  await ada.bringToFront();
  await ada.keyboard.down(a0.team === 'blue' ? 'd' : 'a'); await ada.waitForTimeout(1200); await ada.keyboard.up(a0.team === 'blue' ? 'd' : 'a');
  const a1 = await hostPlayer('Ada');
  ok(Math.abs(a1.x - a0.x) > 40, `movement reached the projector (${Math.round(a1.x - a0.x)}px)`);

  // Questions: put Ada next to a terminal (projector-side), answer on her laptop.
  // t1 (top-left) has a clear straight path from the blue base; walk there at running pace.
  const term = await host.evaluate(() => window.__clashHost.terminals[0]);
  await ada.evaluate(t => new Promise(done => {
    const id = setInterval(() => {
      const l = window.__clashLocal, dx = t.x + 14 - l.x, dy = t.y + 14 - l.y, d = Math.hypot(dx, dy);
      if (d < 6) { clearInterval(id); done(); return; }
      const step = Math.min(10, d); l.x += dx / d * step; l.y += dy / d * step;
    }, 50);
  }), term);
  ok(await until(async () => { const p = await hostPlayer('Ada'); return Math.hypot(p.x - term.x, p.y - term.y) < 40; }, 8000), 'Ada walked to a terminal (projector agrees)');
  await ada.keyboard.press('e');
  await ada.getByRole('dialog').waitFor({ timeout: 10000 });
  ok(await until(async () => !!(await hostPlayer('Ada')).answering, 5000), 'projector froze Ada at the terminal');
  await shot(ada, 'question');
  await ada.keyboard.press('1');
  if (process.env.HSC_DEBUG) {
    ada.on('console', m => console.log('[ada]', m.type(), m.text().slice(0, 200)));
    ada.on('response', r => { if (r.url().includes('/rpc/clash_')) console.log('[ada rpc]', r.status(), r.url().split('/rpc/')[1]); });
    host.on('response', r => { if (r.url().includes('/rpc/clash_receipts')) r.text().then(t => console.log('[host receipts]', r.status(), t.slice(0, 200))); });
    await ada.waitForTimeout(3000);
    console.log('[dialog]', (await ada.getByRole('dialog').count()) ? (await ada.getByRole('dialog').innerText()).slice(0, 200) : 'closed');
  }
  ok(await until(async () => (await hostPlayer('Ada')).answered === 1, 8000), 'the database-recorded answer reached the projector');
  const a2 = await hostPlayer('Ada');
  ok(a2.answering === null, 'Ada unfrozen after answering');

  // Shooting from a student laptop spends energy on the projector.
  await host.evaluate(n => { const g = window.__clashHost; const p = Object.values(g.players).find(x => x.name === n); p.energy = 60; }, 'Ada');
  await ada.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
  await ada.mouse.move(900, 380); await ada.mouse.down(); await ada.waitForTimeout(700); await ada.mouse.up();
  const a3 = await hostPlayer('Ada');
  ok(a3.energy < 60, `firing spent energy (${Math.round(a3.energy)})`);
  await ada.waitForTimeout(1500);
  await shot(ada, 'student');
  await shot(host, 'projector');


  // End the match early from the projector side and check both screens.
  await host.evaluate(() => { const g = window.__clashHost; g.t = g.duration - 0.5; });
  await host.getByText(/wins!|Draw!/).waitFor({ timeout: 15000 });
  ok(true, 'projector shows the result');
  await shot(host, 'results');
  ok(await until(async () => (await ada.getByText(/Your team won|Your team lost|Draw|Final whistle/).count()) > 0, 15000), 'student sees match over');
  await shot(ada, 'over');
} finally {
  await browser.close();
}
ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
