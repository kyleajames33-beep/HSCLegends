// Optional real-browser smoke: see README.md for installation and server setup.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.HSC_PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(pathToFileURL(modulePath).href) : await import('playwright');
const base = process.env.HSC_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${base}/lab-rush.html`, { waitUntil: 'load' });
      const sound = page.getByRole('button', { name: 'Sound off' });
      await sound.click();
      assert.equal(await page.getByRole('button', { name: 'Sound on' }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: /start run/i }).click();
      assert.equal(await page.evaluate(() => document.activeElement?.matches('.play-panel h2')), true, 'question heading receives focus');
      await page.getByRole('button', { name: /forward and reverse reaction rates are equal/i }).click();
      assert.equal(await page.evaluate(() => document.activeElement?.matches('.play-panel h2')), true, 'answer feedback receives focus');
      await page.getByRole('button', { name: /next question/i }).click();
      await page.getByRole('button', { name: /sealed vessel maintained/i }).click();
      await page.getByRole('button', { name: /next question/i }).click();
      await page.getByRole('button', { name: /net forward reaction forms more HI/i }).click();
      await page.getByRole('button', { name: /shop upgrades/i }).click();
      await page.getByRole('button', { name: '$30' }).click();
      assert.equal(await page.getByText('OWNED').count(), 1);
      await page.getByRole('button', { name: /back to game/i }).click();
      await page.getByRole('button', { name: /next question/i }).click();
      await page.getByRole('button', { name: /fire blast/i }).click();
      assert.equal(await page.locator('.boss-bar').getByText('40 / 100 HP').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow at ${viewport.width}px`);
      assert.equal(await page.locator('.boss img').evaluate(img => img.complete && img.naturalWidth > 0), true);
      assert.deepEqual(errors, []);
      const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
      assert.doesNotMatch(viewportMeta || '', /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/i);
      if (process.env.HSC_TEST_CONNECTED_ENTRY === '1') {
        await page.goto(`${base}/campaign`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: /boss campaign/i }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `campaign overflow at ${viewport.width}px`);
      }
      assert.deepEqual(errors, []);
      console.log(`${viewport.width}px: demo actions, boss art and layout passed${process.env.HSC_TEST_CONNECTED_ENTRY === '1' ? '; connected Campaign entry checked' : ''}`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
