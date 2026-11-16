// Optional real-browser acceptance; install/setup instructions are in README.md.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { QUESTIONS } from '../../prototypes/lab-tycoon/src/content.mjs';
const modulePath = process.env.HSC_PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(pathToFileURL(modulePath).href) : await import('playwright');
const base = process.env.HSC_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(`${base}/arena`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'ENTER ARENA' }).click();
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H2');
      assert.equal(await page.getByRole('timer').textContent(), '20 SEC');
      await page.getByRole('button', { name: /Shield · 2 energy/ }).focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.getByRole('button', { name: /Shield armed/ }).isDisabled(), true);
      let item;
      async function current() { const stem = await page.getByRole('heading', { level: 2 }).innerText(); return QUESTIONS.find(q => q.stem === stem); }
      item = await current(); assert.ok(item);
      await page.getByRole('button', { name: `${String.fromCharCode(65 + (item.answer + 1) % 4)} ${item.answers[(item.answer + 1) % 4]}`, exact: true }).click();
      await page.getByRole('heading', { name: 'Shield saved you.' }).waitFor();
      assert.equal(await page.getByLabel('3 of 3 hearts').count(), 1);
      await page.getByRole('button', { name: 'NEXT ROUND' }).click();
      for (let turn = 0; turn < 8; turn++) {
        item = await current(); assert.ok(item);
        await page.getByRole('button', { name: `${String.fromCharCode(65 + item.answer)} ${item.answers[item.answer]}`, exact: true }).click();
        if (await page.getByRole('button', { name: 'SEE RESULTS' }).count()) { await page.getByRole('button', { name: 'SEE RESULTS' }).click(); break; }
        await page.getByRole('button', { name: 'NEXT ROUND' }).click();
      }
      await page.getByRole('button', { name: 'PLAY AGAIN' }).waitFor();
      assert.equal(await page.getByText('Review 1 missed answer', { exact: true }).count(), 1);
      await page.getByRole('button', { name: 'PLAY AGAIN' }).click();
      await page.getByRole('button', { name: 'ENTER ARENA' }).click();
      await page.getByRole('button', { name: /Scan · 2 energy/ }).click();
      assert.equal(await page.getByRole('button', { name: /Removed by Scan/ }).count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`${width}px: simulated arena, keyboard shield, full run, review, replay and scan passed`);
    } finally { await page.close(); }
  }
  const page = await browser.newPage();
  try {
    await page.clock.install();
    await page.goto(`${base}/arena`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'ENTER ARENA' }).click();
    await page.clock.fastForward(21000);
    await page.getByRole('heading', { name: 'Time ran out.' }).waitFor();
    assert.equal(await page.getByLabel('2 of 3 hearts').count(), 1);
    console.log('deadline: delayed clock resolves one timeout and one lost heart');
  } finally { await page.close(); }
} finally { await browser.close(); }
