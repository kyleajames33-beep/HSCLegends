// Optional iOS install prompt smoke; no account or external network required.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.HSC_PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(pathToFileURL(modulePath).href) : await import('playwright');
const base = process.env.HSC_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
  });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByText('Add Legends to your home screen:').waitFor();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('legends_install_dismissed')), '1');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByText('Add Legends to your home screen:').count(), 0);
    console.log('iOS install prompt appears once and remains dismissed after reload');
  } finally { await page.close(); }
} finally { await browser.close(); }
