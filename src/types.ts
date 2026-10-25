export type CaptureDevice = 'desktop' | 'laptop' | 'tablet' | 'mobile';
export type CaptureFormat = 'jpeg' | 'png' | 'webp';
export type SitePlatform = 'auto' | 'wix' | 'generic';

export interface CaptureOptions {
  url: string;
  device: CaptureDevice;
  fullPage: boolean;
  format: CaptureFormat;
  delay: number;
  hidePopups: boolean;
  platform: SitePlatform;
  hideWixBanner: boolean;
  forceReveal: boolean;
  popupWait?: number;
}

export interface ScreenshotNotes {
  dismissed?: number;
  hidden?: number;
  platform?: 'wix' | 'generic';
  truncated?: boolean;
}

export interface ScreenshotResult {
  blob: Blob;
  objectUrl: string;
  url: string;
  device: CaptureDevice;
  durationMs: number;
  notes: ScreenshotNotes;
  mimeType: string;
  dimensions?: { width: number; height: number };
}

export interface ScreenshotError {
  status: number;
  message: string;
  retryAfterSeconds?: number;
}
