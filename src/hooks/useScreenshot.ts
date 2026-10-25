import {useCallback, useEffect, useRef, useState} from 'react';
import type {CaptureOptions, ScreenshotError, ScreenshotResult} from '../types';

function readNotes(header: string | null): ScreenshotResult['notes'] {
  if (!header) return {};
  const dismissed = header.match(/popups-dismissed=(\d+)/)?.[1];
  const hidden = header.match(/popups-hidden=(\d+)/)?.[1];
  const platform = header.match(/platform=(wix|generic)/)?.[1];
  return {
    ...(dismissed ? {dismissed: Number(dismissed)} : {}),
    ...(hidden ? {hidden: Number(hidden)} : {}),
    ...(platform ? {platform: platform as 'wix' | 'generic'} : {}),
    ...(header.includes('truncated=true') ? {truncated: true} : {}),
  };
}

async function errorFromResponse(response: Response): Promise<ScreenshotError> {
  let message = '';
  try {
    const payload: unknown = await response.json();
    if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string') message = payload.error;
  } catch {
    // Proxy and gateway failures may return HTML instead of JSON.
  }
  const retryAfter = Number(response.headers.get('Retry-After'));
  if (response.status === 429 && !message) message = 'Too many requests. Wait for the retry timer before trying again.';
  if (response.status === 413 && !message) message = 'The screenshot is too large. Disable Full Page or choose a smaller device.';
  if (response.status === 504 && !message) message = 'The capture timed out. Try again without Full Page or with a shorter delay.';
  return {
    status: response.status,
    message: message || `The screenshot request failed (HTTP ${response.status}).`,
    ...(retryAfter > 0 ? {retryAfterSeconds: retryAfter} : {}),
  };
}

export function useScreenshot() {
  const [result, setResult] = useState<ScreenshotResult | null>(null);
  const [error, setError] = useState<ScreenshotError | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const lastOptions = useRef<CaptureOptions | null>(null);

  useEffect(() => {
    if (!result?.objectUrl) return;
    return () => URL.revokeObjectURL(result.objectUrl);
  }, [result?.objectUrl]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => setElapsedSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  const run = useCallback(async (options: CaptureOptions) => {
    controller.current?.abort();
    const abortController = new AbortController();
    controller.current = abortController;
    lastOptions.current = options;
    const started = performance.now();
    setResult(null);
    setError(null);
    setCancelled(false);
    setElapsedSeconds(0);
    setLoading(true);
    const timeout = window.setTimeout(() => abortController.abort('CLIENT_TIMEOUT'), 55000);

    try {
      const response = await fetch('/api/screenshot', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'image/jpeg, image/png, image/webp, application/json'},
        body: JSON.stringify(options),
        signal: abortController.signal,
      });
      if (!response.ok) throw await errorFromResponse(response);
      const responseBlob = await response.blob();
      const mimeType = responseBlob.type || response.headers.get('Content-Type') || 'image/jpeg';
      const blob = responseBlob.type ? responseBlob : new Blob([responseBlob], {type: mimeType});
      const objectUrl = URL.createObjectURL(blob);
      setResult({
        blob,
        objectUrl,
        url: options.url,
        device: options.device,
        durationMs: performance.now() - started,
        notes: readNotes(response.headers.get('X-Screenshot-Notes')),
        mimeType,
      });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError' || abortController.signal.aborted) {
        setCancelled(true);
      } else if (typeof caught === 'object' && caught !== null && 'status' in caught && typeof caught.status === 'number') {
        setError(caught as ScreenshotError);
      } else {
        setError({status: 0, message: caught instanceof Error ? caught.message : 'Unable to contact the screenshot service.'});
      }
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === abortController) controller.current = null;
      setLoading(false);
    }
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);
  const retry = useCallback(() => {
    if (lastOptions.current) void run(lastOptions.current);
  }, [run]);

  return {result, error, loading, elapsedSeconds, cancelled, run, cancel, retry};
}
