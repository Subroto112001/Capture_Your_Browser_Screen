import { launchBrowser } from '../lib/browser.js';
import { CAPTURE_CONFIG, capturePage, isTrackerHostname } from '../lib/capture.js';
import { assertSafeUrl } from '../lib/validateUrl.js';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/benchmark.mjs <https://site.example/>');
  process.exit(2);
}

const dnsCache = new Map();
const metrics = { total: 0, failed: 0, blockedSsrF: 0, blockedTracker: 0, bytes: 0 };
let browser;
try {
  const { url } = await assertSafeUrl(target, dnsCache);
  const launchStarted = Date.now();
  browser = await launchBrowser({ width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const launchMs = Date.now() - launchStarted;
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const destination = request.url();
    if (destination.startsWith('data:') || destination.startsWith('blob:')) return request.continue();
    let hostname = '';
    try { hostname = new URL(destination).hostname; } catch { /* URL validator handles malformed values */ }
    if (hostname && isTrackerHostname(hostname)) { metrics.blockedTracker++; return request.abort('blockedbyclient'); }
    try { await assertSafeUrl(destination, dnsCache); return request.continue(); }
    catch (error) { metrics.blockedSsrF++; console.warn('[benchmark] blocked unsafe request:', error.message); return request.abort('accessdenied'); }
  });
  const deadline = Date.now() + CAPTURE_CONFIG.defaultLocalSeconds * 1000;
  const result = await capturePage(page, { url: url.href, fullPage: true, format: 'jpeg', platform: 'auto', deadline, serverless: false, networkMetrics: metrics });
  console.info(JSON.stringify({ launchMs, ...result.timings, encoding: 0, elapsedMs: result.elapsedMs + launchMs, ...result.metrics, height: result.height, truncated: result.truncated, quality: result.quality, scale: result.scale, degraded: result.degraded }, null, 2));
  await page.close();
} catch (error) {
  console.error(JSON.stringify({ error: error.message, statusCode: error.statusCode || 500 }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
