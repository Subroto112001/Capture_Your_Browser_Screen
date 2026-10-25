import {useCallback, useRef, useState} from 'react';
import {AnimatePresence, motion, useReducedMotion} from 'motion/react';
import {Copy, Download, Expand, Globe2} from 'lucide-react';
import {Lightbox} from './Lightbox';
import {PreviewViewer} from './PreviewViewer';
import type {ScreenshotResult} from '../types';

interface ResultPanelProps {
  result: ScreenshotResult;
  onToast: (message: string, kind?: 'success' | 'info') => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getHostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return 'website'; }
}

function getExtension(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
}

export function ResultPanel({result, onToast}: ResultPanelProps) {
  const [dimensions, setDimensions] = useState<ScreenshotResult['dimensions']>(result.dimensions);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const lightboxTrigger = useRef<HTMLElement | null>(null);

  const onDimensions = useCallback((width: number, height: number) => {
    setDimensions(current => current?.width === width && current.height === height ? current : {width, height});
  }, []);

  const download = useCallback(() => {
    const anchor = document.createElement('a');
    const hostname = getHostname(result.url).replace(/[^a-z\d.-]/gi, '-').replace(/^-+|-+$/g, '') || 'website';
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    anchor.href = result.objectUrl;
    anchor.download = `${hostname}-${result.device}-${stamp}.${getExtension(result.mimeType)}`;
    anchor.click();
    onToast('Downloaded');
  }, [onToast, result.device, result.mimeType, result.objectUrl, result.url]);

  const copy = useCallback(async () => {
    try {
      if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard access is unavailable.');
      let pngBlob = result.blob;
      if (!result.mimeType.includes('png')) {
        if (!('createImageBitmap' in window)) throw new Error('Image conversion is unavailable.');
        const bitmap = await createImageBitmap(result.blob);
        try {
          if (bitmap.width * bitmap.height > 20000000) throw new Error('This image is too large to copy reliably.');
          let converted: Blob | null = null;
          if ('OffscreenCanvas' in window) {
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            if (context) {
              context.drawImage(bitmap, 0, 0);
              converted = await canvas.convertToBlob({type: 'image/png'});
            }
          } else {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d');
            if (context) {
              context.drawImage(bitmap, 0, 0);
              converted = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            }
          }
          if (!converted) throw new Error('PNG conversion failed.');
          pngBlob = converted;
        } finally {
          bitmap.close();
        }
      }
      await navigator.clipboard.write([new ClipboardItem({'image/png': pngBlob})]);
      onToast('Copied to clipboard');
    } catch {
      onToast("Couldn't copy — use Download instead", 'info');
    }
  }, [onToast, result.blob, result.mimeType]);

  const openLightbox = (trigger?: HTMLElement) => {
    lightboxTrigger.current = trigger || panelRef.current;
    setLightboxOpen(true);
  };
  const notes = result.notes;
  const popupCount = (notes.dismissed || 0) + (notes.hidden || 0);
  const deviceFrame = result.device === 'mobile' ? 'device-frame--mobile' : result.device === 'tablet' ? 'device-frame--tablet' : 'device-frame--desktop';

  return <>
    <AnimatePresence>
      <motion.section ref={panelRef} className="result-panel card-surface" aria-labelledby="result-title" initial={reduceMotion ? false : {opacity: 0, y: 18}} animate={{opacity: 1, y: 0}} transition={{duration: reduceMotion ? 0 : 0.32}}>
        <div className="result-panel-header">
          <div className="result-panel-heading">
            <div className="result-title-line"><span className="result-heading-icon"><Globe2 size={18} /></span><h2 id="result-title">Captured Screenshot</h2></div>
            <div className="result-chips" aria-label="Screenshot details">
              <span className="result-chip"><Globe2 size={14} />{getHostname(result.url)}</span>
              <span className="result-chip">{dimensions ? `${dimensions.width} × ${dimensions.height} px` : 'Reading image dimensions…'}</span>
              <span className="result-chip">{formatBytes(result.blob.size)}</span>
              <span className="result-chip">{result.mimeType.replace('image/', '').toUpperCase()}</span>
              <span className="result-chip">{(result.durationMs / 1000).toFixed(1)}s</span>
              {popupCount > 0 && <span className="result-badge">{popupCount} popup{popupCount === 1 ? '' : 's'} handled</span>}
              {notes.platform && <span className="result-badge">{notes.platform === 'wix' ? 'Wix' : 'Generic'} profile</span>}
              {notes.truncated && <span className="result-badge result-badge--warning">Truncated at 16,000px</span>}
            </div>
          </div>
          <div className="result-actions">
            <button className="result-action result-action--download" type="button" onClick={download} aria-label="Download screenshot" title="Download screenshot"><Download size={17} /><span>Download</span></button>
            <button className="result-action result-action--secondary" type="button" onClick={() => void copy()} aria-label="Copy screenshot to clipboard" title="Copy screenshot"><Copy size={17} /><span>Copy</span></button>
            <button className="result-action result-action--secondary" type="button" onClick={event => openLightbox(event.currentTarget)} aria-label="Open full-size screenshot" title="Open full size" disabled={!dimensions}><Expand size={17} /><span>Open full size</span></button>
          </div>
        </div>

        <div className={`device-frame ${deviceFrame}`}>
          {result.device === 'mobile' && <div className="phone-speaker" aria-hidden="true" />}
          {result.device !== 'mobile' && <div className="browser-chrome">
            <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>
            <div className="address-bar" title={result.url}>{result.url}</div>
          </div>}
          <PreviewViewer
            blob={result.blob}
            objectUrl={result.objectUrl}
            device={result.device}
            alt={`Screenshot of ${getHostname(result.url)}`}
            onOpen={openLightbox}
            onDimensions={onDimensions}
          />
          {result.device === 'mobile' && <div className="phone-home-indicator" aria-hidden="true" />}
        </div>

        <div className="result-viewer-footer">
          <p>Scroll to inspect the full page. Open full size for detailed zoom and panning.</p>
        </div>
      </motion.section>
    </AnimatePresence>
    {lightboxOpen && dimensions && <Lightbox src={result.objectUrl} alt={`Full-resolution screenshot of ${getHostname(result.url)}`} width={dimensions.width} height={dimensions.height} onClose={() => setLightboxOpen(false)} onDownload={download} triggerRef={lightboxTrigger} />}
  </>;
}
