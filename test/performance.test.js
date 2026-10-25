import assert from 'node:assert/strict';
import { allocatePhaseBudgets, getSizeFallbacks, isTrackerHostname, processingDeadline } from '../lib/capture.js';
import { assertSafeUrl, resolveHost } from '../lib/validateUrl.js';

const budgets = allocatePhaseBudgets(10000);
assert.equal(Object.values(budgets).reduce((sum, value) => sum + value, 0), 10000);
assert.ok(budgets.scroll > budgets.popup, 'scroll receives a proportional share larger than popup handling');
const readyAt = 30000;
assert.equal(processingDeadline(readyAt, 100, 150000), 130000, 'browser cold start does not consume the requested processing window');

for (const tracker of ['www.google-analytics.com', 'www.googletagmanager.com', 'connect.facebook.net', 'browser.sentry-cdn.com']) {
  assert.equal(isTrackerHostname(tracker), true, `${tracker} should match the tracker list`);
}
for (const contentHost of ['static.wixstatic.com', 'video.wixstatic.com', 'static.parastorage.com', 'fonts.gstatic.com']) {
  assert.equal(isTrackerHostname(contentHost), false, `${contentHost} must remain available for visible content`);
}

const fallbacks = getSizeFallbacks();
assert.deepEqual(fallbacks, [
  { quality: 75, scale: 1 },
  { quality: 65, scale: 1 },
  { quality: 65, scale: 0.75 },
  { quality: 65, scale: 0.5 },
]);
assert.ok(fallbacks.findIndex(item => item.scale < 1) > fallbacks.findIndex(item => item.quality === 65 && item.scale === 1), 'quality reduction precedes downscaling');

let lookups = 0;
const cache = new Map();
const lookup = async () => {
  lookups++;
  await new Promise(resolve => setTimeout(resolve, 10));
  return [{ address: '93.184.216.34', family: 4 }];
};
const [first, second] = await Promise.all([resolveHost('content.example', cache, lookup), resolveHost('content.example', cache, lookup)]);
assert.equal(lookups, 1, 'parallel requests for one host share a pending DNS lookup');
assert.deepEqual(first, second);
lookups = 0;
const validationCache = new Map();
const checked = await Promise.all([
  assertSafeUrl('https://capture-cache.example/one', validationCache, lookup),
  assertSafeUrl('https://capture-cache.example/two', validationCache, lookup),
]);
assert.equal(lookups, 1, 'parallel SSRF validations for one hostname share the validated-host promise');
assert.equal(checked.length, 2);
console.info('[test:performance] budgets, degradation helpers, tracker exclusions, size ladder, and shared DNS lookup passed');
