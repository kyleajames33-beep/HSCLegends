// Reactor Clash solo practice smoke test (no backend needed).
// Plays briefly: walks, answers at a terminal, fires, fast-forwards to the boss.
//   HSC_PLAYWRIGHT_MODULE=<playwright/index.mjs> [HSC_SCREENSHOT_DIR=dir] node tests/browser/clash-practice.smoke.mjs
const { chromium } = await import(process.env.HSC_PLAYWRIGHT_MODULE ?? 'playwright');
const BASE = process.env.HSC_BASE_URL ?? 'http://localhost:3000';
const SHOTS = process.env.HSC_SCREENSHOT_DIR;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/practice-${name}.png` }); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${BASE}/clash`);
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForFunction(() => !!window.__clash, null, { timeout: 15000 });
  const me = () => page.evaluate(() => { const p = window.__clash.players.me; return { x: p.x, y: p.y, energy: p.energy, answering: p.answering, answered: p.stats.answered }; });

  const a = await me();
  await page.keyboard.down('d'); await page.waitForTimeout(1200);
  await shot(page, 'walking');
  await page.keyboard.up('d');
  ok((await me()).x - a.x > 40, 'walks with the keyboard');

  await page.evaluate(() => { const g = window.__clash, p = g.players.me, t = g.terminals[4]; p.x = t.x + 20; p.y = t.y; });
  await page.waitForTimeout(300);
  await page.keyboard.press('e');
  await page.getByRole('dialog').waitFor({ timeout: 5000 });
  ok(!!(await me()).answering, 'answering freezes you at the terminal');
  await shot(page, 'answering');
  await page.keyboard.press('2');
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
  ok((await me()).answered === 1, 'answer counted');

  await page.evaluate(() => { window.__clash.players.me.energy = 50; });
  await page.mouse.move(900, 300); await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up();
  ok((await me()).energy < 50, 'firing spends energy');
  await page.waitForTimeout(4000);
  await shot(page, 'play');

  await page.evaluate(() => { window.__clash.t = window.__clash.duration - 58; });
  await page.waitForTimeout(3000);
  ok(await page.evaluate(() => !!window.__clash.boss), 'boss arrives for the final minute');
  await shot(page, 'boss');
} finally {
  await browser.close();
}
ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
