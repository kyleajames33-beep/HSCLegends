// Run against `npm start` after a production build; dev unregisters workers.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.HSC_PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(pathToFileURL(modulePath).href) : await import('playwright');
const base = process.env.HSC_BASE_URL || 'http://localhost:3001';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cacheKeys = await page.evaluate(async () => {
    const cache = await caches.open('legends-offline-v3');
    return (await cache.keys()).map(request => new URL(request.url).pathname).sort();
  });
  assert.deepEqual(cacheKeys, ['/lab-rush.html', '/offline.html']);
  await context.setOffline(true);
  await page.goto(`${base}/profile`, { waitUntil: 'load' });
  await page.getByRole('heading', { name: /Connection lost/ }).waitFor();
  await page.getByRole('link', { name: /Play Lab Rush/ }).click();
  await page.getByRole('button', { name: /START RUN/ }).click();
  await page.getByRole('button', { name: /forward and reverse reaction rates are equal/i }).click();
  await page.getByText(/damage to the Reactor Golem/i).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log('Production worker: offline navigation recovers public play; Lab Rush answers work without network');
  await context.close();
} finally { await browser.close(); }
