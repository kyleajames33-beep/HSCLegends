// Optional real-browser smoke: see README.md for installation and server setup.
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const modulePath = process.env.HSC_PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(pathToFileURL(modulePath).href) : await import('playwright');
const base = process.env.HSC_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (const route of ['/', '/games']) {
    const page = await browser.newPage({ viewport: { width: 320, height: 720 } });
    try {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Skip to game choices');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'game-actions');
      await page.keyboard.press('Tab');
      assert.match(await page.evaluate(() => document.activeElement?.textContent || ''), /Join a game/);
      const boxes = await page.locator('#game-actions > a').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { y: rect.y, width: rect.width };
      }));
      assert.equal(boxes.length, 3);
      assert.ok(boxes.every(box => Math.abs(box.y - boxes[0].y) < 1 && box.width >= 44));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
      assert.equal(await page.locator('nav[aria-label="Main"] a[aria-current="page"]').count(), 1);
      assert.match(await page.getByRole('link', { name: /Knockout Solo/i }).innerText(), /simulated rivals/i);
      console.log(`${route}: 320px layout, focus order, skip link and navigation passed`);
    } finally { await page.close(); }
  }
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      for (const route of ['/', '/games']) {
        await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${route} has no horizontal overflow at ${width}px`);
        assert.match(await page.getByRole('link', { name: /Knockout Solo/i }).innerText(), /simulated rivals/i);
        if (width === 1440) {
          assert.equal(await page.locator('nav[aria-label="Desktop"] a[aria-current="page"]').count(), 1);
          assert.equal(await page.locator('nav[aria-label="Main"]').isVisible(), false);
        }
      }
      console.log(`${width}px: home and games fit and identify simulated rivals`);
    } finally { await page.close(); }
  }
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await desktop.goto(base, { waitUntil: 'networkidle' });
    const scientist = desktop.locator('img[src*="lab-scientist"]');
    assert.equal(await scientist.count(), 1);
    assert.equal(await scientist.evaluate(img => img.complete && img.naturalWidth > 0), true, 'hero character loads');
    assert.equal(await desktop.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'desktop has no horizontal overflow');
    console.log('desktop: illustrated hero loads without overflow');
  } finally { await desktop.close(); }
} finally { await browser.close(); }
