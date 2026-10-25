import {useCallback, useEffect, useRef, useState} from 'react';
import type {PointerEvent, RefObject} from 'react';
import {Download, Minus, Plus, X} from 'lucide-react';

interface LightboxProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  onClose: () => void;
  onDownload: () => void;
  triggerRef: RefObject<HTMLElement | null>;
}

interface PanState {
  x: number;
  y: number;
  zoom: number;
}

export function Lightbox({src, alt, width, height, onClose, onDownload, triggerRef}: LightboxProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{pointerId: number; x: number; y: number; originX: number; originY: number} | null>(null);
  const pointers = useRef(new Map<number, {x: number; y: number}>());
  const pinchRef = useRef<{distance: number; zoom: number; contentX: number; contentY: number} | null>(null);
  const lastTapRef = useRef<{at: number; x: number; y: number} | null>(null);
  const lastTouchDoubleTapRef = useRef(0);
  const historyKeyRef = useRef('');
  const closeCallbackRef = useRef(onClose);
  closeCallbackRef.current = onClose;
  const [stageSize, setStageSize] = useState({width: window.visualViewport?.width || window.innerWidth, height: window.visualViewport?.height || window.innerHeight});
  const [pan, setPan] = useState<PanState>({x: 0, y: 0, zoom: 1});
  const fitZoom = Math.min((stageSize.width - 64) / width, (stageSize.height - 128) / height, 1);

  const fit = useCallback(() => {
    const nextZoom = Math.max(0.01, Math.min((stageSize.width - 64) / width, (stageSize.height - 128) / height, 1));
    setPan({x: (stageSize.width - width * nextZoom) / 2, y: (stageSize.height - height * nextZoom) / 2, zoom: nextZoom});
  }, [height, stageSize.height, stageSize.width, width]);

  const setZoomAt = useCallback((zoom: number, clientX?: number, clientY?: number) => {
    const nextZoom = Math.min(8, Math.max(fitZoom, zoom));
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || clientX === undefined || clientY === undefined) {
      setPan(value => ({...value, zoom: nextZoom}));
      return;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setPan(value => ({
      zoom: nextZoom,
      x: x - (x - value.x) * nextZoom / value.zoom,
      y: y - (y - value.y) * nextZoom / value.zoom,
    }));
  }, [fitZoom]);

  useEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    const resize = () => setStageSize({width: window.visualViewport?.width || window.innerWidth, height: window.visualViewport?.height || window.innerHeight});
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    const body = document.body;
    const scrollY = window.scrollY;
    const bodyStyles = {overflow: body.style.overflow, position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width};
    const previousHistoryState = history.state;
    const historyKey = `screenshot-lightbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    historyKeyRef.current = historyKey;
    const previousState = typeof previousHistoryState === 'object' && previousHistoryState !== null ? previousHistoryState : {previousHistoryState};
    history.pushState({...previousState, __screenshotLightbox: historyKey}, '', location.href);
    const onPopState = () => {
      if (history.state?.__screenshotLightbox !== historyKey) closeCallbackRef.current();
    };
    window.addEventListener('popstate', onPopState);
    document.body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    closeRef.current?.focus();
    return () => {
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.removeEventListener('popstate', onPopState);
      if (history.state?.__screenshotLightbox === historyKey) history.replaceState(previousHistoryState, '', location.href);
      Object.assign(body.style, bodyStyles);
      window.scrollTo(0, scrollY);
      triggerRef.current?.focus();
    };
  }, [triggerRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeLightbox(); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoomAt(pan.zoom * 1.2); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); setZoomAt(pan.zoom / 1.2); }
      else if (event.key === '0') { event.preventDefault(); fit(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); setPan(value => ({...value, x: value.x + 80})); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); setPan(value => ({...value, x: value.x - 80})); }
      else if (event.key === 'ArrowUp' || event.key === 'PageUp') { event.preventDefault(); setPan(value => ({...value, y: value.y + 80})); }
      else if (event.key === 'ArrowDown' || event.key === 'PageDown') { event.preventDefault(); setPan(value => ({...value, y: value.y - 80})); }
      else if (event.key === 'Home') { event.preventDefault(); setPan(value => ({...value, y: 0})); }
      else if (event.key === 'End') { event.preventDefault(); setPan(value => ({...value, y: stageSize.height - height * value.zoom})); }
      else if (event.key === 'Tab') {
        const focusable = [...(stageRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fit, height, pan.zoom, setZoomAt, stageSize.height]);

  const closeLightbox = useCallback(() => {
    if (history.state?.__screenshotLightbox === historyKeyRef.current) history.back();
    else closeCallbackRef.current();
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setZoomAt(pan.zoom * factor, event.clientX, event.clientY);
    };
    stage.addEventListener('wheel', onWheel, {passive: false});
    return () => stage.removeEventListener('wheel', onWheel);
  }, [pan.zoom, setZoomAt]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      const centerX = (first.x + second.x) / 2 - (stageRef.current?.getBoundingClientRect().left || 0);
      const centerY = (first.y + second.y) / 2 - (stageRef.current?.getBoundingClientRect().top || 0);
      pinchRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        zoom: pan.zoom,
        contentX: (centerX - pan.x) / pan.zoom,
        contentY: (centerY - pan.y) / pan.zoom,
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y};
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (pointers.current.size >= 2 && pinchRef.current) {
      const [first, second] = [...pointers.current.values()];
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = (first.x + second.x) / 2 - rect.left;
      const centerY = (first.y + second.y) / 2 - rect.top;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const nextZoom = Math.min(8, Math.max(fitZoom, pinchRef.current.zoom * distance / pinchRef.current.distance));
      setPan({zoom: nextZoom, x: centerX - pinchRef.current.contentX * nextZoom, y: centerY - pinchRef.current.contentY * nextZoom});
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan(value => ({...value, x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y}));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (event.pointerType === 'touch' && drag?.pointerId === event.pointerId && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 12) {
      const now = performance.now();
      const previousTap = lastTapRef.current;
      if (previousTap && now - previousTap.at < 320 && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < 28) {
        lastTapRef.current = null;
        lastTouchDoubleTapRef.current = now;
        if (Math.abs(pan.zoom - 1) < 0.02) fit();
        else setZoomAt(1, event.clientX, event.clientY);
      } else lastTapRef.current = {at: now, x: event.clientX, y: event.clientY};
    }
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    const remaining = [...pointers.current.entries()][0];
    if (remaining) dragRef.current = {pointerId: remaining[0], x: remaining[1].x, y: remaining[1].y, originX: pan.x, originY: pan.y};
  };

  return <div className="lightbox-backdrop" role="dialog" aria-modal="true" aria-label="Full-resolution screenshot preview" onMouseDown={event => { if (event.target === event.currentTarget) closeLightbox(); }}>
    <div className="lightbox-toolbar">
      <div className="lightbox-title">Full-resolution preview <span>{Math.round(pan.zoom / Math.max(fitZoom, 0.01) * 100)}% of fit</span></div>
      <div className="lightbox-actions">
        <button type="button" onClick={() => setZoomAt(pan.zoom / 1.2)} aria-label="Zoom out" title="Zoom out"><Minus /></button>
        <button type="button" onClick={fit} aria-label="Fit image" title="Fit"><span>Fit</span></button>
        <button type="button" onClick={() => setZoomAt(1)} aria-label="View at 100 percent" title="100%"><span>100%</span></button>
        <button type="button" onClick={() => setZoomAt(pan.zoom * 1.2)} aria-label="Zoom in" title="Zoom in"><Plus /></button>
        <button type="button" onClick={onDownload} aria-label="Download screenshot" title="Download"><Download /></button>
        <button ref={closeRef} type="button" onClick={closeLightbox} aria-label="Close full-resolution preview" title="Close"><X /></button>
      </div>
    </div>
    <div ref={stageRef} className="lightbox-stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={() => { if (performance.now() - lastTouchDoubleTapRef.current > 500) { if (Math.abs(pan.zoom - 1) < 0.02) fit(); else setZoomAt(1); } }}>
      <img className="lightbox-image" src={src} alt={alt} draggable={false} style={{width, height, transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${pan.zoom})`}} />
    </div>
  </div>;
}
