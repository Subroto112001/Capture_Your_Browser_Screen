/** Screenshot preparation and capture pipeline. All timings and heuristics live here. */
export const CAPTURE_CONFIG = {
  maxHeight: 16000,
  deadlineReserve: 8000,
  navigationMinimum: 1000,
  fontWait: 2500,
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
  generic: { settle: 8000, networkQuiet: 700, networkCap: 6000, popupWait: 3, scrollWait: 200, scrollCap: 8000 },
  wix: { settle: 8000, networkQuiet: 700, networkCap: 6000, popupWait: 6, scrollWait: 400, scrollCap: 15000 },
  navigationTimeout: 20000,
  imageWait: 2500,
  finalPause: 500,
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

async function remainingMs(deadline, reserve = CAPTURE_CONFIG.deadlineReserve) {
  return Math.max(0, deadline ? deadline - Date.now() - reserve : Number.MAX_SAFE_INTEGER);
}

async function waitWithin(promise, ms) {
  if (ms <= 0) return;
  await Promise.race([promise.catch(() => {}), sleep(ms)]);
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
  const deadline = options.deadline || startedAt + 48000;
  const platformOverride = options.platform || 'auto';
  const hidePopups = options.hidePopups !== false;
  const hideWixBanner = options.hideWixBanner === true;
  const config = CAPTURE_CONFIG;
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
  const requestStart = () => { inFlight++; lastNetworkAt = Date.now(); };
  const requestEnd = () => { inFlight = Math.max(0, inFlight - 1); lastNetworkAt = Date.now(); };
  page.on('request', requestStart);
  page.on('requestfinished', requestEnd);
  page.on('requestfailed', requestEnd);

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
  try {
    if (options.url) {
      const navBudget = Math.min(config.navigationTimeout, await remainingMs(deadline));
      if (navBudget < config.navigationMinimum) throw Object.assign(new Error('Capture deadline reached before navigation.'), { statusCode: 504 });
      try {
        await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: navBudget });
      } catch (error) {
        if (/net::ERR_/i.test(error.message)) throw Object.assign(new Error('The target website could not be opened.'), { statusCode: 502 });
        if (!page.url() || page.url() === 'about:blank') throw Object.assign(new Error('The target page did not finish opening before the capture deadline.'), { statusCode: 504 });
        console.warn('[capture] navigation continued after a timeout:', error.message);
      }
    }

    platform = await detectPlatform(page, platformOverride, config);
    const profile = platform === 'wix' ? config.wix : config.generic;
    const popupWait = options.popupWait === undefined ? profile.popupWait : Math.min(config.popupMaxWait, Math.max(0, options.popupWait));

    const readyBudget = Math.min(profile.settle, await remainingMs(deadline));
    if (readyBudget > 0) await waitWithin(page.waitForFunction(() => document.readyState === 'complete', { timeout: readyBudget }), readyBudget);
    const fontBudget = Math.min(config.fontWait, await remainingMs(deadline));
    if (fontBudget > 0) await waitWithin(page.evaluate(() => document.fonts?.ready), fontBudget);

    const networkDeadline = Date.now() + Math.min(profile.networkCap, await remainingMs(deadline));
    while (Date.now() < networkDeadline && await remainingMs(deadline) > 0) {
      await sweepNow();
      if (inFlight === 0 && Date.now() - lastNetworkAt >= profile.networkQuiet) break;
      await sleep(config.networkPoll);
    }

    const popupDeadline = Date.now() + Math.min(hidePopups ? popupWait * 1000 : 0, await remainingMs(deadline));
    while (Date.now() < popupDeadline && await remainingMs(deadline) > 0) {
      await sweepNow();
      await sleep(Math.min(config.sweepInterval, popupDeadline - Date.now()));
    }

    height = await page.evaluate(measureHeightScript, platform === 'wix', config.wixHeightSelectors);
    if (options.fullPage) {
      const scrollDeadline = Date.now() + Math.min(profile.scrollCap, await remainingMs(deadline));
      const step = Math.max(config.scrollMinimum, Math.round(page.viewport().height * config.scrollFraction));
      let y = 0;
      while (y < height && Date.now() < scrollDeadline && await remainingMs(deadline) > 0) {
        await page.evaluate(async (nextY, nearBefore, nearAfter, decodeWait) => {
          window.scrollTo(0, nextY);
          for (const image of document.images) if (image.loading === 'lazy') image.loading = 'eager';
          const visible = [...document.images].filter(img => { const r = img.getBoundingClientRect(); return r.bottom >= -innerHeight * nearBefore && r.top <= innerHeight * (1 + nearAfter); });
          const visibleElements = [...document.querySelectorAll('body *')].filter(element => { const r = element.getBoundingClientRect(); return r.bottom >= -innerHeight * nearBefore && r.top <= innerHeight * (1 + nearAfter); });
          const backgroundUrls = visibleElements.flatMap(element => [...getComputedStyle(element).backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)].map(match => match[1]));
          const backgroundWaits = backgroundUrls.map(url => new Promise(resolve => { const image = new Image(); image.onload = image.onerror = resolve; image.src = url; }));
          await Promise.race([Promise.all([...visible.map(img => img.decode?.().catch(() => {}) || Promise.resolve()), ...backgroundWaits]), new Promise(resolve => setTimeout(resolve, decodeWait))]);
        }, y, config.nearViewportBefore, config.nearViewportAfter, config.imageDecodeWait);
        await sweepNow();
        await sleep(Math.min(profile.scrollWait, Math.max(0, scrollDeadline - Date.now())));
        height = await page.evaluate(measureHeightScript, platform === 'wix', config.wixHeightSelectors);
        y += step;
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(Math.min(config.finalPause, await remainingMs(deadline)));
    }

    await page.evaluate(async (imageWait, videoFrameTime, nearBefore, nearAfter) => {
      for (const video of document.querySelectorAll('video')) {
        video.pause();
          try { video.currentTime = videoFrameTime; } catch { /* poster remains available */ }
      }
      const visibleImages = [...document.images].filter(img => { const r = img.getBoundingClientRect(); return r.bottom > -innerHeight * nearBefore && r.top < innerHeight * (1 + nearAfter); });
      const imageWaits = visibleImages.map(img => img.decode?.().catch(() => {}) || Promise.resolve());
      const backgrounds = [...document.querySelectorAll('body *')].filter(element => { const r = element.getBoundingClientRect(); return r.bottom > -innerHeight * nearBefore && r.top < innerHeight * (1 + nearAfter); })
        .map(element => getComputedStyle(element).backgroundImage).filter(value => value && value !== 'none').flatMap(value => [...value.matchAll(/url\(["']?(.*?)["']?\)/g)].map(match => match[1]));
      const backgroundWaits = backgrounds.map(url => new Promise(resolve => { const image = new Image(); image.onload = image.onerror = resolve; image.src = url; }));
      await Promise.race([Promise.all([...imageWaits, ...backgroundWaits]), new Promise(resolve => setTimeout(resolve, imageWait))]);
    }, config.imageWait, config.videoFrameTime, config.nearViewportBefore, config.nearViewportAfter);

    if (options.forceReveal) await page.evaluate(excludedSelector => {
      for (const element of document.querySelectorAll('body *')) {
        const style = getComputedStyle(element);
        if ((style.opacity === '0' || style.visibility === 'hidden') && style.position !== 'fixed' && style.position !== 'sticky' && !element.closest(excludedSelector)) {
          element.style.setProperty('opacity', '1', 'important');
          element.style.setProperty('visibility', 'visible', 'important');
        }
      }
    }, config.forceRevealExcludedSelector);

    height = await page.evaluate(measureHeightScript, platform === 'wix', config.wixHeightSelectors);
    const finalHeight = options.fullPage ? Math.min(height, config.maxHeight) : page.viewport().height;
    truncated = options.fullPage && height > config.maxHeight;
    const delayMs = Math.max(0, Number(options.delay) || 0);
    if (delayMs > 0) await sleep(Math.min(delayMs, await remainingMs(deadline)));

    await sweepNow();

    const screenshotOptions = {
      type: options.format || 'jpeg',
      optimizeForSpeed: true,
      captureBeyondViewport: Boolean(options.fullPage),
    };
    if (screenshotOptions.type !== 'png') screenshotOptions.quality = 85;
    if (options.fullPage) screenshotOptions.clip = { x: 0, y: 0, width: page.viewport().width, height: finalHeight, scale: 1 };
    const captureBudget = Math.max(1, deadline - Date.now());
    let captureTimer;
    try {
      buffer = await Promise.race([
        page.screenshot(screenshotOptions),
        new Promise((_, reject) => {
          captureTimer = setTimeout(() => reject(Object.assign(new Error('Screenshot capture exceeded the available deadline.'), { statusCode: 504 })), captureBudget);
        }),
      ]);
    } finally {
      clearTimeout(captureTimer);
    }

    const notesState = await page.evaluate(() => ({ ...window.__screenshotPopupCounts, descriptors: window.__screenshotPopupDescriptors || [] }));
    console.info('[capture] overlay handling', JSON.stringify({ dismissed: notesState.dismissed, hidden: notesState.hidden, descriptors: notesState.descriptors.slice(0, 4), platform, elapsedMs: Date.now() - startedAt }));
    const notes = `popups-dismissed=${notesState.dismissed}; popups-hidden=${notesState.hidden}; platform=${platform}${truncated ? '; truncated=true' : ''}`;
    return { buffer, outputMime: screenshotOptions.type === 'png' ? 'image/png' : screenshotOptions.type === 'webp' ? 'image/webp' : 'image/jpeg', notes, platform, truncated, height, elapsedMs: Date.now() - startedAt };
  } finally {
    clearInterval(sweepTimer);
    page.off('request', requestStart);
    page.off('requestfinished', requestEnd);
    page.off('requestfailed', requestEnd);
  }
}
