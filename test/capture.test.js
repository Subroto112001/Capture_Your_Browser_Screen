import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../lib/browser.js';
import { capturePage } from '../lib/capture.js';
import { assertSafeUrl } from '../lib/validateUrl.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(root, 'fixtures');
const outputDir = path.join(root, 'output');
const viewport = { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
await fs.mkdir(outputDir, { recursive: true });
const browser = await launchBrowser(viewport);

function pngDimensions(buffer) {
  const bytes = Buffer.from(buffer);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', 'fixture capture should be PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

try {
  const cases = [
    { name: 'popup-delayed', popupWait: 4 },
    { name: 'cookie-banner', popupWait: 0 },
    { name: 'sticky-header', popupWait: 0 },
    { name: 'lazy-reveal', popupWait: 0 },
    { name: 'vh-sections', popupWait: 0 },
    { name: 'video', popupWait: 0 },
  ];
  for (const testCase of cases) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setContent(await fs.readFile(path.join(fixtureDir, `${testCase.name}.html`), 'utf8'), { waitUntil: 'domcontentloaded' });
    const started = Date.now();
    const result = await capturePage(page, { fullPage: true, format: 'png', platform: 'generic', popupWait: testCase.popupWait });
    const dimensions = pngDimensions(result.buffer);
    assert.equal(dimensions.width, 1920, `${testCase.name} screenshot width`);
    assert.equal(await page.$eval('header', element => element.isConnected && getComputedStyle(element).display !== 'none'), true, `${testCase.name} header should remain visible`);
    if (testCase.name === 'popup-delayed') {
      assert.equal(await page.$('.promo'), null, 'delayed popup should be dismissed');
      assert.match(result.notes, /popups-dismissed=\d+/);
    }
    if (testCase.name === 'cookie-banner') assert.equal(await page.$eval('.cookie-banner', element => getComputedStyle(element).display), 'none');
    if (testCase.name === 'sticky-header') assert.equal(await page.$eval('#site-header', element => element.isConnected), true);
    if (testCase.name === 'lazy-reveal') assert.equal(await page.$$eval('.section', elements => elements.every(element => element.classList.contains('visible'))), true);
    if (testCase.name === 'vh-sections') assert.ok(Math.abs(dimensions.height - 3240) <= 2, `expected ~3240px page height, got ${dimensions.height}`);
    if (testCase.name === 'video') assert.equal(await page.$eval('#fixture-video', element => element.paused), true);
    await fs.writeFile(path.join(outputDir, `${testCase.name}.png`), result.buffer);
    console.info(`[test:capture] ${testCase.name}: ${dimensions.width}x${dimensions.height}, ${Date.now() - started}ms, ${result.notes}`);
    await page.close();
  }

  const profileFixture = await fs.readFile(path.join(fixtureDir, 'vh-sections.html'), 'utf8');
  for (const platform of ['generic', 'wix']) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setContent(profileFixture, { waitUntil: 'domcontentloaded' });
    const started = Date.now();
    const result = await capturePage(page, { fullPage: true, format: 'png', platform, popupWait: 0 });
    console.info(`[test:capture] profile timing ${platform}: ${Date.now() - started}ms (height=${result.height}px)`);
    await page.close();
  }

  if (process.env.TEST_WIX_URL) {
    const dnsCache = new Map();
    const { url } = await assertSafeUrl(process.env.TEST_WIX_URL, dnsCache);
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const destination = request.url();
      if (destination.startsWith('data:') || destination.startsWith('blob:')) return request.continue();
      try { await assertSafeUrl(destination, dnsCache); return request.continue(); }
      catch { return request.abort('accessdenied'); }
    });
    const started = Date.now();
    const result = await capturePage(page, { url: url.href, fullPage: true, format: 'png', platform: 'auto', deadline: started + 48000 });
    await fs.writeFile(path.join(outputDir, 'real-wix-smoke.png'), result.buffer);
    console.info(`[test:capture] TEST_WIX_URL: ${result.height}px, ${result.elapsedMs}ms, ${result.notes}`);
    await page.close();
  }
} finally {
  await browser.close();
}
