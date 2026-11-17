// Reactor Clash multiplayer end-to-end against the REAL staging project.
// One projector (host) and two students in separate browser contexts.
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

const browser = await chromium.launch();
const errors = [];
const ctx = async (opts = {}) => { const c = await browser.newContext({ viewport: { width: 1366, height: 768 }, ...opts }); return c; };
const watch = page => { page.on('pageerror', e => errors.push(e.message)); return page; };

try {
  // Projector
  const hostCtx = await ctx();
  await hostCtx.addInitScript(([key, value]) => sessionStorage.setItem(key, value), [`hsc-live-${REF}-host`, JSON.stringify(session)]);
  const host = watch(await hostCtx.newPage());
  await host.goto(`${BASE}/clash/host`);
  await host.getByRole('button', { name: 'Create match' }).click();
  const codeEl = host.locator('p').filter({ hasText: /^[A-HJKMNP-Z2-9]{6}$/ }).first();
  await codeEl.waitFor({ timeout: 20000 });
  const code = (await codeEl.textContent()).trim();
  ok(/^[A-HJKMNP-Z2-9]{6}$/.test(code), `match created with code ${code}`);

  // Two students
  const students = [];
  for (const name of ['Ada', 'Ben']) {
    const page = watch(await (await ctx()).newPage());
    await page.goto(`${BASE}/clash/join?code=${code}`);
    await page.getByPlaceholder('Nickname').fill(name);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.getByText("you're on", { exact: false }).waitFor({ timeout: 20000 });
    students.push(page);
  }
  ok(await until(async () => (await host.locator('button', { hasText: /^(Ada|Ben)$/ }).count()) === 2), 'both students appear in the lobby');
  await shot(host, 'lobby');

  await host.getByRole('button', { name: 'Start match' }).click();
  ok(await until(() => host.evaluate(() => !!window.__clashHost)), 'match running on the projector');
  const [ada, ben] = students;
  await ada.locator('canvas').waitFor({ timeout: 20000 });
  ok(true, 'students switched to the game view');

  const hostPlayer = name => host.evaluate(n => { const g = window.__clashHost; const p = Object.values(g.players).find(x => x.name === n); return p && { id: p.id, x: p.x, y: p.y, team: p.team, energy: p.energy, answered: p.stats.answered, answering: p.answering, remote: !!p.remote }; }, name);
  const a0 = await hostPlayer('Ada');
  ok(a0 && a0.remote, `Ada is in the host simulation on ${a0?.team}`);

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
