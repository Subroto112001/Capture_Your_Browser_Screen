/** Vercel/Vite HTTP adapter for secure screenshot capture. */
import 'dotenv/config';
import { assertSafeUrl } from '../lib/validateUrl.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { launchBrowser } from '../lib/browser.js';
import { capturePage, CAPTURE_CONFIG } from '../lib/capture.js';

export const config = { maxDuration: 60 };

const WATCHDOG_MS = 50000;
const SERVERLESS_MAX_BYTES = 4 * 1024 * 1024;
const LOCAL_MAX_BYTES = 30 * 1024 * 1024;
const DEVICES = {
  desktop: { viewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
  laptop: { viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
  tablet: { viewport: { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  mobile: { viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
};
const FORMATS = new Set(['jpeg', 'png', 'webp']);
const PLATFORMS = new Set(['auto', 'wix', 'generic']);
const BOOLEAN_FIELDS = ['fullPage', 'hidePopups', 'hideWixBanner', 'forceReveal'];

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { throw Object.assign(new Error('Invalid JSON format in request body.'), { statusCode: 400 }); }
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 64 * 1024) reject(Object.assign(new Error('Request payload exceeds maximum allowed size.'), { statusCode: 400 }));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(Object.assign(new Error('Invalid JSON format in request body.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function serverlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);
}

function asHttpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

export default async function handler(req, res) {
  if (!res.status) res.status = function status(code) { this.statusCode = code; return this; };
  if (!res.json) res.json = function json(data) { if (!this.getHeader('Content-Type')) this.setHeader('Content-Type', 'application/json'); this.end(JSON.stringify(data)); return this; };
  if (!res.send) res.send = function send(data) { this.end(data); return this; };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method Not Allowed. Please use POST.' }); }

  const rateLimit = checkRateLimit(req);
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetTime / 1000)));
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return res.status(429).json({ error: `Too many screenshot requests. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.` });
  }

  let browser;
  let watchdog;
  let watchdogExpired = false;
  const dnsCache = new Map();
  try {
    const body = await parseBody(req);
    const allowedKeys = new Set(['url', 'device', 'fullPage', 'format', 'delay', 'hidePopups', 'popupWait', 'platform', 'hideWixBanner', 'forceReveal']);
    for (const key of Object.keys(body)) if (!allowedKeys.has(key)) return res.status(400).json({ error: `Unrecognized parameter '${key}'.` });
    if (!body.url || typeof body.url !== 'string') return res.status(400).json({ error: 'A valid website URL string is required.' });

    const device = String(body.device ?? 'desktop').toLowerCase();
    if (!DEVICES[device]) return res.status(400).json({ error: `Invalid device '${body.device}'. Allowed options: ${Object.keys(DEVICES).join(', ')}.` });
    const format = String(body.format ?? 'jpeg').toLowerCase();
    if (!FORMATS.has(format)) return res.status(400).json({ error: 'Invalid format. Allowed options: jpeg, png, webp.' });
    const platform = String(body.platform ?? 'auto').toLowerCase();
    if (!PLATFORMS.has(platform)) return res.status(400).json({ error: "Invalid platform. Allowed options: 'auto', 'wix', 'generic'." });
    for (const field of BOOLEAN_FIELDS) if (body[field] !== undefined && typeof body[field] !== 'boolean') return res.status(400).json({ error: `'${field}' must be a boolean.` });

    const delay = Number(body.delay ?? 0);
    if (!Number.isFinite(delay) || delay < 0 || delay > 10) return res.status(400).json({ error: 'Delay must be a number between 0 and 10 seconds.' });
    const popupWait = body.popupWait === undefined ? undefined : Number(body.popupWait);
    if (popupWait !== undefined && (!Number.isFinite(popupWait) || popupWait < 0 || popupWait > 12)) return res.status(400).json({ error: 'popupWait must be a number between 0 and 12 seconds.' });

    const { url: safeUrl } = await assertSafeUrl(body.url, dnsCache);
    const captureDeadline = Date.now() + 48000;
    const watchdogPromise = new Promise((_, reject) => {
      watchdog = setTimeout(() => {
        watchdogExpired = true;
        if (browser) void browser.close().catch(error => console.error('[screenshot] watchdog browser close failed:', error.message));
        reject(asHttpError('Screenshot capture timed out. Try again without full-page capture or reduce the delay.', 504));
      }, WATCHDOG_MS);
    });

    const execution = (async () => {
      const deviceConfig = DEVICES[device];
      browser = await launchBrowser(deviceConfig.viewport);
      if (watchdogExpired) {
        await browser.close();
        browser = null;
        throw asHttpError('Screenshot capture timed out.', 504);
      }
      const page = await browser.newPage();
      const version = await browser.version();
      const chromeVersion = version.match(/(?:Headless)?Chrome\/([\d.]+)/)?.[1] || '131.0.0.0';
      const ua = deviceConfig.userAgent || `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
      await page.setUserAgent(ua.replace('HeadlessChrome/', 'Chrome/'));
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      if (deviceConfig.userAgent) await page.setViewport(deviceConfig.viewport);
      await page.setRequestInterception(true);
      page.on('request', async intercepted => {
        if (intercepted.resourceType() === 'websocket') return intercepted.abort();
        const destination = intercepted.url();
        if (destination.startsWith('data:') || destination.startsWith('blob:')) return intercepted.continue();
        try { await assertSafeUrl(destination, dnsCache); return intercepted.continue(); }
        catch (error) {
          console.warn(`[SSRF Blocked Subresource] ${destination}: ${error.message}`);
          return intercepted.abort('accessdenied');
        }
      });

      const result = await capturePage(page, {
        url: safeUrl.href,
        deadline: captureDeadline,
        fullPage: body.fullPage ?? false,
        format,
        delay: delay * 1000,
        popupWait,
        hidePopups: body.hidePopups ?? true,
        platform,
        hideWixBanner: body.hideWixBanner ?? false,
        forceReveal: body.forceReveal ?? false,
      });
      const maxBytes = serverlessRuntime() ? SERVERLESS_MAX_BYTES : LOCAL_MAX_BYTES;
      let buffer = result.buffer;
      let outputMime = result.outputMime;
      const capture = async (type, quality, scale = 1) => {
        const clip = body.fullPage || scale !== 1
          ? { x: 0, y: 0, width: deviceConfig.viewport.width, height: body.fullPage ? Math.min(result.height, CAPTURE_CONFIG.maxHeight) : deviceConfig.viewport.height, scale }
          : undefined;
        const remaining = captureDeadline - Date.now();
        if (remaining <= 0) throw asHttpError('Screenshot capture exceeded the available deadline.', 504);
        let timer;
        try {
          return await Promise.race([
            page.screenshot({ type, quality, clip, captureBeyondViewport: Boolean(body.fullPage), optimizeForSpeed: true }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(asHttpError('Screenshot capture exceeded the available deadline.', 504)), remaining); }),
          ]);
        } finally { clearTimeout(timer); }
      };
      if (buffer.length > maxBytes) {
        for (const quality of [70, 55]) {
          buffer = await capture('jpeg', quality);
          outputMime = 'image/jpeg';
          if (buffer.length <= maxBytes) break;
        }
        for (const scale of [0.75, 0.5]) {
          if (buffer.length <= maxBytes) break;
          buffer = await capture('jpeg', 55, scale);
        }
        if (buffer.length > maxBytes) throw asHttpError(`Generated image exceeds the ${serverlessRuntime() ? '4 MB serverless' : '30 MB'} response limit. Use a smaller viewport or disable full-page capture.`, 413);
      }
      return { ...result, buffer, outputMime };
    })();

    const result = await Promise.race([execution, watchdogPromise]);
    clearTimeout(watchdog);
    res.setHeader('Content-Type', result.outputMime);
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Screenshot-Notes', result.notes);
    res.setHeader('Access-Control-Expose-Headers', 'X-Screenshot-Notes');
    return res.status(200).send(result.buffer);
  } catch (error) {
    if (watchdog) clearTimeout(watchdog);
    const statusCode = error.statusCode || 500;
    console.error(`[Screenshot Error ${statusCode}]`, error.message);
    return res.status(statusCode).json({ error: statusCode === 500 ? 'An unexpected error occurred while capturing the website screenshot.' : error.message });
  } finally {
    if (browser) try { await browser.close(); } catch (error) { console.error('[screenshot] browser close failed:', error.message); }
  }
}
