/** Screenshot preparation and capture pipeline. All timings and heuristics live here. */
export const CAPTURE_CONFIG = {
  maxHeight: 16000,
  serverlessMaxBytes: Math.floor(4.4 * 1024 * 1024),
  localMaxBytes: 30 * 1024 * 1024,
  deadlineReserve: 24000,
  captureReserve: 12000,
  maxFunctionDurationSeconds: 120,
  functionSafetySeconds: 5,
  captureLimitMarginSeconds: 15,
  globalResponseReserveSeconds: 8,
  defaultServerlessSeconds: 100,
  defaultLocalSeconds: 90,
  minRequestedSeconds: 60,
  maxRequestedSeconds: 120,
  phaseWeights: { navigation: 0.22, settle: 0.18, popup: 0.08, scroll: 0.38, final: 0.14 },
  navigationBaselineMs: 5000,
  slownessMin: 1,
  slownessMax: 2.5,
  serverlessScrollStepCap: 1500,
  localScrollStepCap: 800,
  scrollQuietMs: 250,
  maxInFlightForQuiet: 2,
  trackerHosts: ['www.google-analytics.com', 'www.googletagmanager.com', 'analytics.google.com', 'connect.facebook.net', 'static.hotjar.com', 'script.hotjar.com', 'www.clarity.ms', 'c.bing.com', 'stats.g.doubleclick.net', 'googleads.g.doubleclick.net', 'px.ads.linkedin.com', 'analytics.tiktok.com', 'sentry.io', 'browser.sentry-cdn.com'],
  sizeFallbacks: [{ quality: 75, scale: 1 }, { quality: 65, scale: 1 }, { quality: 65, scale: 0.75 }, { quality: 65, scale: 0.5 }],
  navigationMinimum: 1000,
  scrollMinimum: 300,
  imageDecodeWait: 1200,
  networkPoll: 100,
  videoFrameTime: 0.1,
  nearViewportBefore: 0.5,
  nearViewportAfter: 1.5,
  overlayCoverRatio: 0.7,
  overlayAreaRatio: 0.25,
  headerTopTolerance: 4,
  headerWidthRatio: 0.75,
  headerHeightRatio: 0.2,
  bannerHeightRatio: 0.35,
  edgeTolerance: 20,
  generic: { settle: 12000, networkQuiet: 800, networkCap: 18000, popupWait: 3 },
  wix: { settle: 16000, networkQuiet: 800, networkCap: 22000, popupWait: 6 },
  navigationTimeout: 35000,
  imageWait: 12000,
  fontWait: 6000,
  backgroundWait: 6000,
  finalPause: 750,
  scrollFraction: 0.6,
  sweepInterval: 500,
  popupMaxWait: 12,
  overlayKeywords: ['cookie', 'consent', 'privacy', 'subscribe', 'newsletter', 'promotion', 'offer', 'allow cookies'],
  closeWords: ['close', 'dismiss', 'no thanks', 'maybe later', 'not now', 'got it', '\u00d7', '\u2715', 'x', 'chiudi', 'cerrar', 'fermer', 'schlie\u00dfen', '\u092c\u0902\u0926 \u0915\u0930\u0947\u0902', '\u09ac\u09a8\u09cd\u09a7 \u0995\u09b0\u09c1\u09a8'],
  acceptWords: ['accept all', 'accept', 'agree', 'allow all', 'allow cookies', 'ok', 'okay', 'acceptar', 'accepter', 'akzeptieren', 'aceptar', '\u0938\u094d\u0935\u0940\u0915\u093e\u0930 \u0915\u0930\u0947\u0902', '\u0997\u09cd\u09b0\u09b9\u09a3 \u0995\u09b0\u09c1\u09a8'],
  overlaySelectors: ['[role="dialog"]', '[aria-modal="true"]', '#POPUPS_ROOT', '[id*="consent-banner" i]', '[data-hook="consent-banner-root"]', '[id*="cookie" i]', '[class*="cookie" i]', '[class*="consent" i]', '[class*="newsletter" i]', '[class*="lightbox" i]', '[class*="popup" i]', '[class*="modal" i]', '[id*="onetrust" i]', '[id*="cookiebot" i]', '.cky-consent-container', '[class*="termly" i]'],
  safeSemanticSelectors: ['header', 'nav', 'main', 'html', 'body'],
  headerIndicatorSelector: 'a, nav, [role="navigation"], [class*="logo" i]',
  dialogSelector: '[role="dialog"], [aria-modal="true"]',
  containedOverlaySelector: '#POPUPS_ROOT, [role="dialog"], [aria-modal="true"]',
  forceRevealExcludedSelector: '[role="dialog"], [aria-modal="true"]',
  wixHeightSelectors: ['#SITE_CONTAINER', '#site-root', '#SITE_PAGES', 'main'],
  wixDetectionSelector: '#SITE_CONTAINER, #site-root',
  wixResourcePattern: 'static\\.(parastorage|wixstatic)\\.com',
  wixAdSelector: '#WIX_ADS',
  knownButtons: ['#onetrust-accept-btn-handler', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '.cky-btn-accept', '[data-testid="close-button"]', '[aria-label="Close"]', '[aria-label="close"]'],
  chatSelectors: ['iframe[src*="tawk"]', 'iframe[src*="intercom"]', 'iframe[src*="crisp"]', 'iframe[src*="drift"]', 'iframe[src*="messenger"]', '[id*="intercom"]', '[class*="intercom"]', '[id*="crisp"]', '[class*="crisp"]', '[id*="drift"]', '[class*="drift"]', '[id*="tawk"]', '[class*="tawk"]'],
};

export function allocatePhaseBudgets(totalMs, weights = CAPTURE_CONFIG.phaseWeights) {
  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  return Object.fromEntries(entries.map(([name, weight]) => [name, Math.floor(Math.max(0, totalMs) * weight / totalWeight)]));
}

export function processingDeadline(browserReadyAt, maxSeconds, hardDeadline) {
  return Math.min(browserReadyAt + maxSeconds * 1000, hardDeadline - CAPTURE_CONFIG.globalResponseReserveSeconds * 1000);
}

export function isTrackerHostname(hostname, hosts = CAPTURE_CONFIG.trackerHosts) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return hosts.some(tracker => host === tracker || host.endsWith(`.${tracker}`));
}

export function getSizeFallbacks() {
  return CAPTURE_CONFIG.sizeFallbacks.map(candidate => ({ ...candidate }));
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForPromiseWithin(promise, ms, fallback) {
  let timer;
  try {
    return await Promise.race([Promise.resolve(promise), new Promise(resolve => { timer = setTimeout(() => resolve(fallback), Math.max(0, ms)); })]);
  } finally { clearTimeout(timer); }
}

function installOverlaySweep(config, initial = {}) {
  const sweep = () => {
    if (!window.__screenshotHidePopups && !window.__screenshotHideWixBanner) return;
    let dismissed = 0;
    let hidden = 0;
    const descriptors = [];
    const describe = element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`.slice(0, 100);
    const isVisible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const textOf = element => `${element.innerText || ''} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''}`.trim().toLowerCase();
    const safeHeader = element => {
      if (element.matches(config.safeSemanticSelectors.join(','))) return true;
      const h1 = document.querySelector('h1');
      if (h1 && element.contains(h1) && !element.matches(config.dialogSelector)) return true;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (style.position === 'fixed' || style.position === 'sticky') && rect.top <= config.headerTopTolerance && rect.width > innerWidth * config.headerWidthRatio && rect.height < innerHeight * config.headerHeightRatio && element.querySelector(config.headerIndicatorSelector);
    };
    const overlayContainers = [...document.querySelectorAll([...config.overlaySelectors, ...config.chatSelectors].join(','))];
    const candidates = new Set(overlayContainers);
    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element);
      if (style.position === 'fixed' || style.position === 'sticky') candidates.add(element);
    }

    if (window.__screenshotHideWixBanner) {
      for (const banner of document.querySelectorAll(config.wixAdSelector)) {
        banner.style.setProperty('display', 'none', 'important');
        hidden++;
        descriptors.push(describe(banner));
      }
    }

    const visible = window.__screenshotHidePopups ? [...candidates].filter(isVisible) : [];
    const overlays = visible.filter(element => {
      if (safeHeader(element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const area = rect.width * rect.height;
      const viewportArea = innerWidth * innerHeight;
      const keyword = config.overlayKeywords.some(word => textOf(element).includes(word));
      const namedDialog = element.matches(config.dialogSelector);
      const popupRoot = element.id === 'POPUPS_ROOT';
      const containedOverlay = Boolean(element.closest(config.containedOverlaySelector));
      const overlayPositioned = style.position === 'fixed' || style.position === 'sticky' || containedOverlay;
      const fullBackdrop = area >= viewportArea * config.overlayCoverRatio && (style.position === 'fixed' || style.position === 'sticky');
      const covers = area >= viewportArea * config.overlayAreaRatio && (style.position === 'fixed' || style.position === 'sticky');
      const edgeBanner = overlayPositioned && (rect.height < innerHeight * config.bannerHeightRatio && (rect.top < config.edgeTolerance || rect.bottom > innerHeight - config.edgeTolerance)) && keyword;
      const chat = config.chatSelectors.some(selector => element.matches(selector));
      return namedDialog || popupRoot || fullBackdrop || covers || edgeBanner || chat;
    });
    const overlaySet = new Set(overlays);
    const buttons = [...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')]
      .filter(element => isVisible(element) && [...overlaySet].some(overlay => overlay === element || overlay.contains(element)));
    const buttonRank = element => {
      const label = textOf(element);
      if (config.closeWords.some(word => word.length === 1 ? label === word : label === word || label.includes(word))) return 0;
      if (config.acceptWords.some(word => word === 'ok' || word === 'okay' ? label === word : label === word || label.includes(word))) return 1;
      return 2;
    };
    buttons.sort((a, b) => buttonRank(a) - buttonRank(b));
    if (buttons.length) {
      try { buttons[0].click(); dismissed++; descriptors.push(describe(buttons[0])); } catch { /* detached between scan and click */ }
    } else if (window.__screenshotHidePopups) {
      for (const selector of config.knownButtons) {
        const button = document.querySelector(selector);
        if (button && isVisible(button)) { try { button.click(); dismissed++; descriptors.push(describe(button)); } catch { /* ignore */ } }
      }
    }

    for (const overlay of overlays) {
      if (!overlay.isConnected || safeHeader(overlay)) continue;
      overlay.style.setProperty('display', 'none', 'important');
      overlay.setAttribute('data-screenshot-overlay-hidden', 'true');
      hidden++;
      descriptors.push(describe(overlay));
    }
    const body = document.body;
    const html = document.documentElement;
    const lockedScroll = getComputedStyle(html).overflow === 'hidden' || (body && getComputedStyle(body).overflow === 'hidden') || [...(body?.classList || []), ...html.classList].some(name => /^(modal-open|no-scroll|noscroll)$/i.test(name));
    if ((dismissed || hidden) && lockedScroll) for (const element of [html, body].filter(Boolean)) {
      element.style.removeProperty('overflow');
      element.style.removeProperty('position');
      element.style.removeProperty('padding-right');
      for (const className of [...element.classList]) if (/^(modal-open|no-scroll|noscroll)$/i.test(className)) element.classList.remove(className);
    }
    if (dismissed || hidden) {
      window.__screenshotPopupCounts.dismissed += dismissed;
      window.__screenshotPopupCounts.hidden += hidden;
      window.__screenshotPopupDescriptors.push(...descriptors.slice(0, 4));
    }
  };

  window.__screenshotHidePopups = initial.hidePopups ?? window.__screenshotHidePopups ?? true;
  window.__screenshotHideWixBanner = initial.hideWixBanner ?? window.__screenshotHideWixBanner ?? false;
  window.__screenshotPopupCounts = window.__screenshotPopupCounts ?? { dismissed: 0, hidden: 0 };
  window.__screenshotPopupDescriptors = window.__screenshotPopupDescriptors ?? [];
  window.__screenshotSweep = sweep;
  const attachObserver = () => {
    if (window.__screenshotObserver || !document.documentElement) return;
    window.__screenshotObserver = new MutationObserver(() => {
      if (window.__screenshotHidePopups || window.__screenshotHideWixBanner) sweep();
    });
    window.__screenshotObserver.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) attachObserver();
  else document.addEventListener('DOMContentLoaded', attachObserver, { once: true });
}

function measureHeightScript(wix, wixHeightSelectors) {
  const values = [document.documentElement.scrollHeight, document.body?.scrollHeight || 0, document.documentElement.getBoundingClientRect().height];
  if (wix) for (const selector of wixHeightSelectors) {
    for (const element of document.querySelectorAll(selector)) values.push(element.scrollHeight, element.getBoundingClientRect().height + element.getBoundingClientRect().top);
  }
  return Math.ceil(Math.max(innerHeight, ...values));
}

async function detectPlatform(page, override, config) {
  if (override !== 'auto') return override;
  return page.evaluate((wixSelector, resourcePattern) => {
    const generator = document.querySelector('meta[name="generator"]')?.content || '';
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const resourceRegex = new RegExp(resourcePattern, 'i');
    return /wix/i.test(generator) || Boolean(window.wixBiSession) || Boolean(document.querySelector(wixSelector)) || resources.some(url => resourceRegex.test(url)) ? 'wix' : 'generic';
  }, config.wixDetectionSelector, config.wixResourcePattern);
}

/** Capture a loaded/new page; fixture callers can use page.setContent() then call this without a URL. */
export async function capturePage(page, options = {}) {
  const startedAt = Date.now();
  const config = CAPTURE_CONFIG;
  const deadline = options.deadline || startedAt + config.defaultLocalSeconds * 1000;
  const serverless = options.serverless === true;
  const platformOverride = options.platform || 'auto';
  const hidePopups = options.hidePopups !== false;
  const hideWixBanner = options.hideWixBanner === true;
  const degraded = new Set();
  const timings = { navigation: 0, settle: 0, popup: 0, scroll: 0, final: 0, capture: 0 };
  const networkMetrics = options.networkMetrics || { total: 0, failed: 0, blockedSsrF: 0, blockedTracker: 0, bytes: 0 };
  const usableMs = Math.max(0, deadline - Date.now() - config.deadlineReserve);
  const budgets = allocatePhaseBudgets(usableMs);
  const installConfig = { overlayKeywords: config.overlayKeywords, closeWords: config.closeWords, acceptWords: config.acceptWords, knownButtons: config.knownButtons, chatSelectors: config.chatSelectors, overlaySelectors: config.overlaySelectors, safeSemanticSelectors: config.safeSemanticSelectors, headerIndicatorSelector: config.headerIndicatorSelector, dialogSelector: config.dialogSelector, containedOverlaySelector: config.containedOverlaySelector, wixAdSelector: config.wixAdSelector, headerTopTolerance: config.headerTopTolerance, headerWidthRatio: config.headerWidthRatio, headerHeightRatio: config.headerHeightRatio, overlayCoverRatio: config.overlayCoverRatio, overlayAreaRatio: config.overlayAreaRatio, bannerHeightRatio: config.bannerHeightRatio, edgeTolerance: config.edgeTolerance };
  const overlayOptions = { hidePopups, hideWixBanner };
  await page.evaluateOnNewDocument(installOverlaySweep, installConfig, overlayOptions);
  await page.evaluate(installOverlaySweep, installConfig, overlayOptions);
  await page.evaluate(({ hidePopups: hide, hideWixBanner: hideBanner }) => {
    window.__screenshotHidePopups = hide;
    window.__screenshotHideWixBanner = hideBanner;
  }, { hidePopups, hideWixBanner });

  let inFlight = 0;
  let lastNetworkAt = Date.now();
  const requestStart = () => { inFlight++; networkMetrics.total++; lastNetworkAt = Date.now(); };
  const requestEnd = () => { inFlight = Math.max(0, inFlight - 1); lastNetworkAt = Date.now(); };
  const requestFailed = () => { networkMetrics.failed++; requestEnd(); };
  const responseReceived = response => {
    const length = Number(response.headers()['content-length']);
    if (Number.isFinite(length) && length > 0) networkMetrics.bytes += length;
  };
  page.on('request', requestStart);
  page.on('requestfinished', requestEnd);
  page.on('requestfailed', requestFailed);
  page.on('response', responseReceived);

  let sweepBusy = false;
  const sweepNow = async () => {
    if ((!hidePopups && !hideWixBanner) || sweepBusy || page.isClosed()) return;
    sweepBusy = true;
    try { await page.evaluate(() => window.__screenshotSweep?.()); } catch { /* navigation can replace the context */ }
    finally { sweepBusy = false; }
  };
  const sweepTimer = setInterval(() => { void sweepNow(); }, config.sweepInterval);
  let platform = 'generic';
  let truncated = false;
  let height = 0;
  let buffer;
  let imageCounts = { total: 0, complete: 0, pending: 0 };
  const runPhase = async (name, callback, budget = budgets[name]) => {
    const started = Date.now();
    const phaseDeadline = Math.min(deadline - config.captureReserve, started + Math.max(0, budget));
    if (phaseDeadline <= started) { degraded.add(name); return undefined; }
    const result = await callback(phaseDeadline);
    timings[name] += Date.now() - started;
    if (Date.now() >= phaseDeadline && Date.now() < deadline - config.captureReserve) degraded.add(`${name}-budget`);
    return result;
  };
  try {
    const navStarted = Date.now();
    if (options.url) {
      const navBudget = Math.min(config.navigationTimeout, budgets.navigation, deadline - Date.now() - config.deadlineReserve);
      if (navBudget < config.navigationMinimum) throw Object.assign(new Error('Capture deadline reached before navigation.'), { statusCode: 504 });
      try { await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: navBudget }); }
      catch (error) {
        if (/net::ERR_/i.test(error.message)) throw Object.assign(new Error('The target website could not be opened.'), { statusCode: 502 });
        if (!page.url() || page.url() === 'about:blank') throw Object.assign(new Error('The target page did not finish opening before the capture deadline.'), { statusCode: 504 });
        degraded.add('navigation');
        console.warn('[capture] navigation continued after timeout');
      }
    }
    timings.navigation = Date.now() - navStarted;
    const slownessFactor = Math.max(config.slownessMin, Math.min(config.slownessMax, timings.navigation / config.navigationBaselineMs));
    platform = await detectPlatform(page, platformOverride, config);
    const profile = platform === 'wix' ? config.wix : config.generic;
    const popupWait = options.popupWait === undefined ? profile.popupWait : Math.min(config.popupMaxWait, Math.max(0, options.popupWait));

    await runPhase('settle', async phaseDeadline => {
      const readyDeadline = Math.min(phaseDeadline, Date.now() + profile.settle * slownessFactor);
      while (Date.now() < readyDeadline) {
        const ready = await page.evaluate(() => document.readyState === 'complete').catch(() => false);
        if (ready) break;
        await sleep(Math.min(config.networkPoll, readyDeadline - Date.now()));
      }
      if (Date.now() >= readyDeadline) degraded.add('document-ready');
      const fontDeadline = Math.min(phaseDeadline, Date.now() + config.fontWait * slownessFactor);
      if (fontDeadline > Date.now()) {
        const fontsReady = await waitForPromiseWithin(page.evaluate(() => document.fonts?.ready.then(() => true)).catch(() => false), fontDeadline - Date.now(), false);
        if (!fontsReady) degraded.add('fonts');
      }
      const quietDeadline = Math.min(phaseDeadline, Date.now() + profile.networkCap * slownessFactor);
      while (Date.now() < quietDeadline) {
        await sweepNow();
        if (inFlight <= config.maxInFlightForQuiet && Date.now() - lastNetworkAt >= profile.networkQuiet) break;
        await sleep(Math.min(config.networkPoll, quietDeadline - Date.now()));
      }
      if (Date.now() >= quietDeadline && (inFlight > config.maxInFlightForQuiet || Date.now() - lastNetworkAt < profile.networkQuiet)) degraded.add('network-quiet');
    });

    if (hidePopups && popupWait > 0) await runPhase('popup', async phaseDeadline => {
      const requestedPopupMs = hidePopups ? popupWait * 1000 * slownessFactor : 0;
      const targetDeadline = Math.min(phaseDeadline, Date.now() + requestedPopupMs);
      if (phaseDeadline - Date.now() < requestedPopupMs) degraded.add('popup-wait');
      while (Date.now() < targetDeadline) {
        await sweepNow();
        await sleep(Math.min(config.sweepInterval, targetDeadline - Date.now()));
      }
    });

    height = await page.evaluate(measureHeightScript, platform === 'wix', config.wixHeightSelectors);
    if (options.fullPage) await runPhase('scroll', async phaseDeadline => {
      const step = Math.max(config.scrollMinimum, Math.round(page.viewport().height * config.scrollFraction));
      const stepCap = (serverless ? config.serverlessScrollStepCap : config.localScrollStepCap) * slownessFactor;
      let y = 0;
      while (y < height && Date.now() < phaseDeadline) {
        const stepStarted = Date.now();
        await page.evaluate(nextY => {
          window.scrollTo(0, nextY);
          for (const image of document.images) if (image.loading === 'lazy') image.loading = 'eager';
        }, y);
        let settled = false;
        while (Date.now() - stepStarted < stepCap && Date.now() < phaseDeadline) {
          const visibleReady = await page.evaluate((nearBefore, nearAfter) => [...document.images]
            .filter(img => { const rect = img.getBoundingClientRect(); return rect.bottom >= -innerHeight * nearBefore && rect.top <= innerHeight * (1 + nearAfter); })
            .every(img => img.complete), config.nearViewportBefore, config.nearViewportAfter).catch(() => true);
          await sweepNow();
          if (inFlight <= config.maxInFlightForQuiet && Date.now() - lastNetworkAt >= config.scrollQuietMs && visibleReady) { settled = true; break; }
          await sleep(config.networkPoll);
        }
        if (!settled) degraded.add('scroll-step-wait');
        height = await page.evaluate(measureHeightScript, platform === 'wix', config.wixHeightSelectors);
        y += step;
      }
      if (y < height) degraded.add('scroll');
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(Math.min(config.finalPause * slownessFactor, Math.max(0, phaseDeadline - Date.now())));
    });

    await runPhase('final', async phaseDeadline => {
      await page.evaluate(videoTime => {
        for (const video of document.querySelectorAll('video')) { video.pause(); try { video.currentTime = videoTime; } catch { /* poster remains available */ } }
      }, config.videoFrameTime);
      const imageDeadline = Math.min(phaseDeadline, Date.now() + config.imageWait * slownessFactor);
      const imagesReady = await waitForPromiseWithin(page.evaluate(async fullPage => {
        const images = [...document.images].filter(image => {
          if (fullPage) return true;
          const rect = image.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < innerHeight;
        });
        await Promise.all(images.map(async image => {
          if (fullPage && image.loading === 'lazy') image.loading = 'eager';
          if (!image.complete) await new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); });
          try { await image.decode(); } catch { /* failed images remain counted */ }
        }));
        await document.fonts?.ready;
        return true;
      }, Boolean(options.fullPage)).catch(() => false), imageDeadline - Date.now(), false);
      if (!imagesReady) degraded.add('images-or-fonts');
      const backgroundDeadline = Math.min(phaseDeadline, Date.now() + config.backgroundWait * slownessFactor);
      const backgroundsReady = await waitForPromiseWithin(page.evaluate(async fullPage => {
        const urls = new Set([...document.querySelectorAll('body *')].filter(element => {
          if (fullPage) return true;
          const rect = element.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < innerHeight;
        }).flatMap(element => [...getComputedStyle(element).backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)].map(match => match[1])));
        await Promise.all([...urls].map(url => new Promise(resolve => { const image = new Image(); image.onload = image.onerror = resolve; image.src = url; })));
        return true;
      }, Boolean(options.fullPage)).catch(() => false), backgroundDeadline - Date.now(), false);
      if (!backgroundsReady) degraded.add('background-images');
      const quietDeadline = Math.min(phaseDeadline, Date.now() + profile.networkQuiet * slownessFactor);
      while (Date.now() < quietDeadline) {
        if (inFlight <= config.maxInFlightForQuiet && Date.now() - lastNetworkAt >= profile.networkQuiet) break;
        await sleep(Math.min(config.networkPoll, quietDeadline - Date.now()));
      }
      if (inFlight > config.maxInFlightForQuiet || Date.now() - lastNetworkAt < profile.networkQuiet) degraded.add('post-scroll-network-quiet');
      if (options.forceReveal) await page.evaluate(excludedSelector => {
        for (const element of document.querySelectorAll('body *')) {
          const style = getComputedStyle(element);
          if ((style.opacity === '0' || style.visibility === 'hidden') && style.position !== 'fixed' && style.position !== 'sticky' && !element.closest(excludedSelector)) {
            element.style.setProperty('opacity', '1', 'important'); element.style.setProperty('visibility', 'visible', 'important');
          }
        }
      }, config.forceRevealExcludedSelector);
      height = await page.evaluate(measureHeightScript, platform === 'wix', config.wixHeightSelectors);
      imageCounts = await page.evaluate(() => ({ total: document.images.length, complete: [...document.images].filter(image => image.complete).length, pending: [...document.images].filter(image => !image.complete).length, failed: [...document.images].filter(image => image.complete && !image.naturalWidth).length }));
      const delayMs = Math.max(0, Number(options.delay) || 0);
      if (delayMs > 0) {
        const remainingDelay = Math.min(delayMs, phaseDeadline - Date.now());
        if (remainingDelay < delayMs) degraded.add('delay');
        if (remainingDelay > 0) await sleep(remainingDelay);
      }
    });

    const finalMeasureStarted = Date.now();
    height = await page.evaluate(measureHeightScript, platform === 'wix', config.wixHeightSelectors);
    truncated = options.fullPage && height > config.maxHeight;
    const finalHeight = options.fullPage ? Math.min(height, config.maxHeight) : page.viewport().height;
    timings.final += Date.now() - finalMeasureStarted;
    await sweepNow();
    const screenshotOptions = { type: options.format || 'jpeg', optimizeForSpeed: true, captureBeyondViewport: Boolean(options.fullPage) };
    if (screenshotOptions.type !== 'png') screenshotOptions.quality = 85;
    if (options.fullPage) screenshotOptions.clip = { x: 0, y: 0, width: page.viewport().width, height: finalHeight, scale: 1 };
    const captureStarted = Date.now();
    const captureBudget = Math.max(1, deadline - Date.now() - config.captureReserve);
    let captureTimer;
    try {
      buffer = await Promise.race([page.screenshot(screenshotOptions), new Promise((_, reject) => { captureTimer = setTimeout(() => reject(Object.assign(new Error('Screenshot capture exceeded the available deadline.'), { statusCode: 504 })), captureBudget); })]);
    } finally { clearTimeout(captureTimer); }
    timings.capture += Date.now() - captureStarted;
    const notesState = await page.evaluate(() => ({ ...window.__screenshotPopupCounts, descriptors: window.__screenshotPopupDescriptors || [] }));
    const degradedList = [...degraded];
    const notes = `popups-dismissed=${notesState.dismissed}; popups-hidden=${notesState.hidden}; platform=${platform}${truncated ? '; truncated=true' : ''}${degradedList.length ? `; degraded=${degradedList.join(',')}` : '; degraded=none'}`;
    const result = { buffer, outputMime: screenshotOptions.type === 'png' ? 'image/png' : screenshotOptions.type === 'webp' ? 'image/webp' : 'image/jpeg', notes, platform, truncated, height, elapsedMs: Date.now() - startedAt, timings, metrics: { ...networkMetrics, images: imageCounts }, degraded: degradedList, quality: screenshotOptions.quality || null, scale: 1 };
    return result;
  } finally {
    clearInterval(sweepTimer);
    page.off('request', requestStart);
    page.off('requestfinished', requestEnd);
    page.off('requestfailed', requestFailed);
    page.off('response', responseReceived);
  }
}
