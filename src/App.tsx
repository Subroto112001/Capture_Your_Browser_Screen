import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {Camera, Check, CircleHelp, Globe2, Monitor, Smartphone, Tablet, X} from 'lucide-react';
import {useReducedMotion} from 'motion/react';
import {ResultPanel} from './components/ResultPanel';
import {SiteFooter} from './components/SiteFooter';
import {StatusToasts, type ToastMessage} from './components/StatusToasts';
import {useScreenshot} from './hooks/useScreenshot';
import type {CaptureDevice, CaptureFormat, CaptureOptions, SitePlatform} from './types';

const statusLines = ['Loading page…', 'Dismissing popups…', 'Scrolling to load images…', 'Capturing screenshot…'];

function normalizeUrl(value: string): string {
  const clean = value.trim();
  return clean && !/^https?:\/\//i.test(clean) ? `https://${clean}` : clean;
}

function LoadingPanel({elapsedSeconds, onCancel}: {elapsedSeconds: number; onCancel: () => void}) {
  const [statusIndex, setStatusIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStatusIndex(index => (index + 1) % statusLines.length), 3500);
    return () => window.clearInterval(timer);
  }, []);
  return <section className="loading-panel" aria-live="polite" aria-busy="true">
    <div className="loading-panel-copy">
      <span className="loading-orbit" aria-hidden="true" />
      <div><h2>Preparing your screenshot</h2><p>{statusLines[statusIndex]} <span>{elapsedSeconds}s</span></p>
        <small>Long full-page Wix captures can take up to about 2 minutes.</small></div>
      <button className="cancel-capture" type="button" onClick={onCancel}><X size={16} /> Cancel</button>
    </div>
    <div className="skeleton-browser" aria-hidden="true"><div className="skeleton-browser-bar"><i /><i /><i /><span /></div><div className="skeleton-shimmer" /></div>
  </section>;
}

export default function App() {
  const [url, setUrl] = useState('');
  const [device, setDevice] = useState<CaptureDevice>('desktop');
  const [fullPage, setFullPage] = useState(false);
  const [format, setFormat] = useState<CaptureFormat>('jpeg');
  const [delay, setDelay] = useState(0);
  const [hidePopups, setHidePopups] = useState(true);
  const [popupWait, setPopupWait] = useState('');
  const [platform, setPlatform] = useState<SitePlatform>('auto');
  const [hideWixBanner, setHideWixBanner] = useState(false);
  const [forceReveal, setForceReveal] = useState(false);
  const [blockTrackers, setBlockTrackers] = useState(true);
  const [maxSeconds, setMaxSeconds] = useState<'auto' | 60 | 90 | 120>('auto');
  const [formError, setFormError] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [retryRemaining, setRetryRemaining] = useState(0);
  const resultAnchor = useRef<HTMLDivElement>(null);
  const toastId = useRef(0);
  const reduceMotion = useReducedMotion();
  const screenshot = useScreenshot();

  const toast = useCallback((message: string, kind: 'success' | 'info' = 'success') => {
    const id = ++toastId.current;
    setToasts(items => [...items, {id, message, kind}]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts(items => items.filter(item => item.id !== id)), []);

  useEffect(() => {
    if (screenshot.result) resultAnchor.current?.scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block: 'start'});
  }, [reduceMotion, screenshot.result]);

  useEffect(() => {
    const seconds = screenshot.error?.status === 429 ? screenshot.error.retryAfterSeconds || 0 : 0;
    setRetryRemaining(seconds);
    if (!seconds) return;
    const timer = window.setInterval(() => setRetryRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [screenshot.error]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = normalizeUrl(url);
    if (!target) {
      setFormError('Enter a website URL to capture.');
      return;
    }
    setUrl(target);
    setFormError('');
    const options: CaptureOptions = {
      url: target,
      device,
      fullPage,
      format,
      delay,
      hidePopups,
      platform,
      hideWixBanner,
      forceReveal,
      blockTrackers,
      maxSeconds,
      ...(popupWait === '' ? {} : {popupWait: Number(popupWait)}),
    };
    void screenshot.run(options);
  };

  const useExample = (example: string) => {
    setUrl(example);
    setFormError('');
  };

  return <div className="page-container app-shell">
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-icon" aria-hidden="true"><Camera size={24} /></div>
        <div><h1>Website Screenshot Tool</h1><p className="subtitle">Professional full-page website captures, ready to inspect and download.</p></div>
      </div>
      <div className="badge-ephemeral"><span className="status-dot" /><span>Zero-Storage · Ephemeral</span></div>
    </header>

    <main className="main-card form-card card-surface">
      <form onSubmit={submit} noValidate>
        <div className="form-group">
          <label htmlFor="url-input" className="form-label"><span>Target Website URL</span><span className="label-hint">https:// will be added if needed</span></label>
          <div className="input-with-icon"><div className="input-icon" aria-hidden="true"><Globe2 size={18} /></div>
            <input id="url-input" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" enterKeyHint="go" value={url} onChange={event => setUrl(event.target.value)} placeholder="example.com or https://your-site.com" autoComplete="url" spellCheck={false} />
            {url && <button type="button" className="clear-input-btn" aria-label="Clear URL" onClick={() => setUrl('')}><X size={18} /></button>}
          </div>
          <span className="label-hint url-helper">https:// will be added if needed</span>
          <div className="quick-chips" aria-label="Example websites"><span className="chips-label">Try:</span>
            <button type="button" className="chip-btn" onClick={() => useExample('https://news.ycombinator.com')}>Hacker News</button>
            <button type="button" className="chip-btn" onClick={() => useExample('https://en.wikipedia.org/wiki/Aurora')}>Wikipedia</button>
            <button type="button" className="chip-btn" onClick={() => useExample('https://github.com')}>GitHub</button>
          </div>
        </div>

        <div className="option-card device-card">
          <span className="option-title" id="device-label">Device Viewport</span>
          <div className="segmented-control" role="radiogroup" aria-labelledby="device-label">
            <label className="control-item"><input type="radio" name="device" value="desktop" checked={device === 'desktop'} onChange={() => setDevice('desktop')} /><span className="control-label"><Monitor size={16} />Desktop<small>1920×1080</small></span></label>
            <label className="control-item"><input type="radio" name="device" value="laptop" checked={device === 'laptop'} onChange={() => setDevice('laptop')} /><span className="control-label"><Monitor size={16} />Laptop<small>1440×900</small></span></label>
            <label className="control-item"><input type="radio" name="device" value="tablet" checked={device === 'tablet'} onChange={() => setDevice('tablet')} /><span className="control-label"><Tablet size={16} />Tablet<small>768×1024</small></span></label>
            <label className="control-item"><input type="radio" name="device" value="mobile" checked={device === 'mobile'} onChange={() => setDevice('mobile')} /><span className="control-label"><Smartphone size={16} />Mobile<small>390×844</small></span></label>
          </div>
        </div>

        <div className="settings-row consistent-options settings-grid">
          <label className="toggle-card option-full"><span className="toggle-info"><span className="toggle-label">Full Page Capture</span><span className="toggle-subtext">Scrolls through up to 16,000px</span></span><span className="switch"><input type="checkbox" checked={fullPage} onChange={event => setFullPage(event.target.checked)} /><span className="slider round" /></span></label>
          <label className="toggle-card popup-toggle option-hide"><span className="toggle-info"><span className="toggle-label">Hide popups &amp; banners</span><span className="toggle-subtext">Dismiss common consent boxes and dialogs.</span></span><span className="switch"><input type="checkbox" checked={hidePopups} onChange={event => setHidePopups(event.target.checked)} /><span className="slider round" /></span></label>
          <div className="select-card option-format"><label className="select-label" htmlFor="format-select">Output Format</label><select id="format-select" value={format} onChange={event => setFormat(event.target.value as CaptureFormat)}><option value="jpeg">JPEG (High quality, 85%)</option><option value="png">PNG (Lossless)</option><option value="webp">WebP</option></select><span className="field-help">Choose image quality and file type.</span></div>
          <div className="select-card option-delay"><label className="select-label" htmlFor="delay-select">Delay before capture</label><select id="delay-select" value={delay} onChange={event => setDelay(Number(event.target.value))}><option value="0">0 seconds</option><option value="1">1 second</option><option value="2">2 seconds</option><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option></select><span className="field-help">Wait before finalizing the image.</span></div>
          <div className="select-card option-popup-wait"><label className="select-label" htmlFor="popup-wait">Popup wait</label><select id="popup-wait" value={popupWait} onChange={event => setPopupWait(event.target.value)}><option value="">Auto (3s general · 6s Wix)</option><option value="0">0 seconds</option><option value="3">3 seconds</option><option value="6">6 seconds</option><option value="10">10 seconds</option></select><span className="field-help">Time to catch delayed overlays.</span></div>
          <div className="select-card option-platform"><label className="select-label" htmlFor="platform-select">Site type</label><select id="platform-select" value={platform} onChange={event => setPlatform(event.target.value as SitePlatform)}><option value="auto">Auto detect</option><option value="wix">Wix</option><option value="generic">Generic</option></select><span className="field-help">Choose the page loading profile.</span></div>
        </div>
        <details className="advanced-options"><summary>Advanced options</summary><div className="advanced-controls"><label><input type="checkbox" checked={hideWixBanner} onChange={event => setHideWixBanner(event.target.checked)} /> Hide Wix free-plan banner</label><label><input type="checkbox" checked={forceReveal} onChange={event => setForceReveal(event.target.checked)} /> Force reveal hidden sections <span className="experimental-label">Experimental</span></label><label><input type="checkbox" checked={blockTrackers} onChange={event => setBlockTrackers(event.target.checked)} /> Block common analytics trackers <span className="toggle-subtext">Visual assets and consent scripts remain allowed.</span></label><label className="advanced-time-limit"><span>Capture time limit<select value={maxSeconds} onChange={event => setMaxSeconds(event.target.value === 'auto' ? 'auto' : Number(event.target.value) as 60 | 90 | 120)}><option value="auto">Auto</option><option value="60">60 seconds</option><option value="90">90 seconds</option><option value="120">120 seconds</option></select><small>Server limits may clamp this value.</small></span></label></div></details>

        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="action-bar">
          <button type="submit" className="btn btn-primary" disabled={screenshot.loading}>
            {screenshot.loading ? <span className="button-spinner" aria-hidden="true" /> : <Camera size={19} aria-hidden="true" />}
            <span>{screenshot.loading ? 'Capturing…' : 'Take Screenshot'}</span>
          </button>
        </div>
      </form>
    </main>

    {screenshot.cancelled && <p className="cancelled-note" role="status"><Check size={16} /> Capture canceled.</p>}
    {screenshot.loading && <LoadingPanel elapsedSeconds={screenshot.elapsedSeconds} onCancel={screenshot.cancel} />}
    {screenshot.error && <section className="error-card error-card-react" role="alert"><div><strong>{screenshot.error.status === 429 ? 'Rate limit reached' : screenshot.error.status === 413 ? 'Screenshot too large' : screenshot.error.status === 504 ? 'Capture timed out' : 'Capture failed'}</strong><p>{screenshot.error.message}</p>{retryRemaining > 0 && <p className="retry-countdown">Try again in {retryRemaining}s</p>}</div><button type="button" className="retry-button" onClick={screenshot.retry}>Retry</button></section>}
    {screenshot.result && <div className="result-container" ref={resultAnchor}><ResultPanel result={screenshot.result} onToast={toast} onRetryLonger={screenshot.retryWithMoreTime} /></div>}

    <SiteFooter />
    <StatusToasts items={toasts} onDismiss={dismissToast} />
  </div>;
}
