import {useEffect, useRef, useState} from 'react';
import type {CaptureDevice} from '../types';

interface PreviewViewerProps {
  blob: Blob;
  objectUrl: string;
  device: CaptureDevice;
  alt: string;
  onOpen: (trigger?: HTMLElement) => void;
  onDimensions: (width: number, height: number) => void;
}

interface PreviewBitmap {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  displayWidth: number;
}

function PreviewTile({bitmap, sourceY, pixelHeight, cssHeight, pixelWidth, displayWidth, root}: {
  bitmap: ImageBitmap;
  sourceY: number;
  pixelHeight: number;
  cssHeight: number;
  pixelWidth: number;
  displayWidth: number;
  root: HTMLElement | null;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let painted = false;
    const paint = () => {
      if (painted || !canvasRef.current) return;
      painted = true;
      const canvas = canvasRef.current;
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      const context = canvas.getContext('2d');
      if (context) context.drawImage(bitmap, 0, sourceY, pixelWidth, pixelHeight, 0, 0, pixelWidth, pixelHeight);
    };
    if (!('IntersectionObserver' in window)) {
      paint();
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        paint();
      } else if (painted && canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
        painted = false;
      }
    }, {root, rootMargin: '600px 0px'});
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [bitmap, pixelHeight, pixelWidth, root, sourceY]);

  return <div ref={wrapperRef} className="preview-tile" style={{height: cssHeight, width: displayWidth}}>
    <canvas ref={canvasRef} aria-hidden="true" style={{width: displayWidth, height: cssHeight}} />
  </div>;
}

export function PreviewViewer({blob, objectUrl, device, alt, onOpen, onDimensions}: PreviewViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [bitmapData, setBitmapData] = useState<PreviewBitmap | null>(null);
  const [naturalDimensions, setNaturalDimensions] = useState<{width: number; height: number} | null>(null);
  const [fallback, setFallback] = useState(false);
  const [zoomPreset, setZoomPreset] = useState<'fit' | 'custom'>('fit');
  const [zoom, setZoom] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => setAvailableWidth(Math.max(1, node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [device]);

  useEffect(() => {
    if (!availableWidth || !('createImageBitmap' in window)) {
      if (!('createImageBitmap' in window)) setFallback(true);
      return;
    }
    let cancelled = false;
    let sourceBitmap: ImageBitmap | null = null;
    let resizedBitmap: ImageBitmap | null = null;
    const timer = window.setTimeout(async () => {
      setIsGenerating(true);
      setFallback(false);
      try {
        sourceBitmap = await createImageBitmap(blob);
        if (cancelled) return;
        const naturalWidth = sourceBitmap.width;
        const naturalHeight = sourceBitmap.height;
        setNaturalDimensions({width: naturalWidth, height: naturalHeight});
        onDimensions(naturalWidth, naturalHeight);
        const desiredWidth = zoomPreset === 'fit' ? Math.min(availableWidth, naturalWidth) : Math.min(naturalWidth, naturalWidth * zoom);
        const pixelCap = window.innerWidth < 820 ? 1600 : 4096;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, naturalWidth / desiredWidth, pixelCap / desiredWidth);
        const resizedWidth = Math.max(1, Math.min(naturalWidth, Math.round(desiredWidth * pixelRatio)));
        const resizedHeight = Math.max(1, Math.round(resizedWidth * naturalHeight / naturalWidth));
        resizedBitmap = await createImageBitmap(sourceBitmap, {resizeWidth: resizedWidth, resizeHeight: resizedHeight, resizeQuality: 'high'});
        sourceBitmap.close();
        sourceBitmap = null;
        if (cancelled) return;
        setFallback(false);
        setBitmapData({bitmap: resizedBitmap, width: resizedWidth, height: resizedHeight, displayWidth: desiredWidth});
        resizedBitmap = null;
      } catch {
        setBitmapData(null);
        setFallback(true);
      } finally {
        sourceBitmap?.close();
        resizedBitmap?.close();
        if (!cancelled) setIsGenerating(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [availableWidth, blob, onDimensions, zoom, zoomPreset]);

  useEffect(() => () => bitmapData?.bitmap.close(), [bitmapData]);

  const tileCount = bitmapData ? Math.ceil(bitmapData.height / 4096) : 0;
  const fitZoom = naturalDimensions ? Math.min(availableWidth, naturalDimensions.width) / naturalDimensions.width : 1;
  const activeZoom = zoomPreset === 'fit' ? fitZoom : zoom;
  const fallbackWidth = naturalDimensions ? Math.min(naturalDimensions.width, zoomPreset === 'fit' ? availableWidth : naturalDimensions.width * zoom) : undefined;

  return <div className={`preview-component device-preview--${device}`}>
    <div className="preview-scroll" ref={scrollRef}>
      <div className="preview-fade preview-fade--top" aria-hidden="true" />
      {bitmapData && !fallback ? <div className="preview-tiles" style={{width: bitmapData.displayWidth}} role="button" aria-label={`Open full-resolution preview of ${alt}`} onClick={event => onOpen(event.currentTarget)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(event.currentTarget); } }} tabIndex={0}>
        {Array.from({length: tileCount}, (_, index) => {
          const sourceY = index * 4096;
          const pixels = Math.min(4096, bitmapData.height - sourceY);
          const cssHeight = pixels * bitmapData.displayWidth / bitmapData.width;
          return <PreviewTile key={`${bitmapData.width}-${bitmapData.height}-${index}`} bitmap={bitmapData.bitmap} sourceY={sourceY} pixelHeight={pixels} cssHeight={cssHeight} pixelWidth={bitmapData.width} displayWidth={bitmapData.displayWidth} root={scrollRef.current} />;
        })}
      </div> : <img className="preview-fallback-image" style={fallbackWidth ? {width: fallbackWidth} : undefined} src={objectUrl} alt={alt} role="button" tabIndex={0} aria-label={`Open full-resolution preview of ${alt}`} onLoad={event => {const {naturalWidth, naturalHeight} = event.currentTarget; setNaturalDimensions({width: naturalWidth, height: naturalHeight}); onDimensions(naturalWidth, naturalHeight);}} onClick={event => onOpen(event.currentTarget)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(event.currentTarget); } }} />}
      {isGenerating && <span className="preview-rendering" aria-live="polite">Preparing sharp preview…</span>}
      <div className="preview-fade preview-fade--bottom" aria-hidden="true" />
    </div>
    <div className="preview-zoom-row"><ZoomControls
      presetFit={() => setZoomPreset('fit')}
      preset50={() => { setZoomPreset('custom'); setZoom(0.5); }}
      preset100={() => { setZoomPreset('custom'); setZoom(1); }}
      zoom={activeZoom}
      zoomLabel={zoomPreset === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}
      onZoom={value => { setZoomPreset('custom'); setZoom(Math.max(0.1, Math.min(2, value))); }}
    /></div>
  </div>;
}

export function ZoomControls({presetFit, preset50, preset100, zoom, zoomLabel, onZoom}: {
  presetFit: () => void;
  preset50: () => void;
  preset100: () => void;
  zoom: number;
  zoomLabel: string;
  onZoom: (zoom: number) => void;
}) {
  return <div className="zoom-controls" aria-label="Preview zoom controls">
    <button type="button" onClick={() => onZoom(zoom - 0.1)} aria-label="Zoom out" title="Zoom out">−</button>
    <button type="button" onClick={presetFit} aria-label="Fit width" title="Fit width">Fit</button>
    <button type="button" onClick={preset50} aria-label="Zoom to 50%">50%</button>
    <button type="button" onClick={preset100} aria-label="Zoom to 100%">100%</button>
    {zoomLabel !== 'Fit' && <span className="zoom-value" aria-live="polite">{zoomLabel}</span>}
    <button type="button" onClick={() => onZoom(zoom + 0.1)} aria-label="Zoom in" title="Zoom in">+</button>
  </div>;
}
