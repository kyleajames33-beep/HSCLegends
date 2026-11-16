// Run only against a local server started without NEXT_PUBLIC_SUPABASE_* values.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.HSC_PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(pathToFileURL(modulePath).href) : await import('playwright');
const base = process.env.HSC_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByText('Account unavailable').waitFor();
    await page.goto(`${base}/tycoon`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /start run/i }).click();
    const backgroundLoaded = await page.locator('.scene').evaluate(async element => {
      const url = getComputedStyle(element).backgroundImage.match(/url\("?(data:image\/webp;base64,[^"]+)"?\)/)?.[1];
      if (!url) return false;
      const image = new Image(); image.src = url;
      try { await image.decode(); return image.naturalWidth > 0; } catch { return false; }
    });
    assert.equal(backgroundLoaded, true, 'embedded lab background loads without a network request');
    await page.getByRole('button', { name: /forward and reverse reaction rates are equal/i }).click();
    await page.getByText(/damage to the Reactor Golem/i).waitFor();
    const connected = await page.request.get(`${base}/join`);
    assert.equal(connected.status(), 503);
    assert.match(await connected.text(), /Play the sample/);
    assert.deepEqual(errors, []);
    console.log('Unconfigured homepage and Tycoon offer the playable sample; connected routes fail closed');
  } finally { await page.close(); }
} finally { await browser.close(); }
