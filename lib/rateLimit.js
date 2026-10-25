/**
 * @file rateLimit.js
 * Best-effort in-memory sliding-window rate limiter for Vercel serverless environments.
 *
 * NOTE: In serverless environments, each cold start or separate container instance
 * maintains its own independent memory space. Therefore, an in-memory limiter is
 * best-effort per-instance. For strict global rate limiting across all instances,
 * edge middleware with Vercel KV/Upstash or Vercel Web Application Firewall (WAF)
 * Rate Limiting rules should be configured.
 */

// Rate limiter configuration: 10 requests per 10 minutes per IP
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 10;
const CLEANUP_INTERVAL_MS = 60 * 1000; // Clean stale entries every 60 seconds

/**
 * In-memory store: Map<clientIp, Array<timestamp>>
 */
const ipStore = new Map();
let lastCleanup = Date.now();

/**
 * Periodically removes expired timestamps and empty IPs to prevent memory leaks.
 */
function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;

  const threshold = now - WINDOW_MS;
  for (const [ip, timestamps] of ipStore.entries()) {
    const valid = timestamps.filter(ts => ts > threshold);
    if (valid.length === 0) {
      ipStore.delete(ip);
    } else {
      ipStore.set(ip, valid);
    }
  }
}

/**
 * Extracts the real client IP from standard HTTP headers or connection.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function getClientIp(req) {
  // Check standard proxy headers first
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ipString = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const clientIp = ipString.split(',')[0].trim();
    if (clientIp) return clientIp;
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0].trim() : realIp.trim();
  }

  return req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
}

/**
 * Checks if the request should be rate-limited under the sliding window.
 * 
 * @param {import('http').IncomingMessage} req
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number, resetTime: number }}
 */
export function checkRateLimit(req) {
  cleanupExpired();

  const ip = getClientIp(req);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  let timestamps = ipStore.get(ip) || [];
  // Keep only timestamps within current sliding window
  timestamps = timestamps.filter(ts => ts > windowStart);

  if (timestamps.length >= MAX_REQUESTS) {
    const oldestTimestamp = timestamps[0];
    const retryAfterMs = Math.max(1000, oldestTimestamp + WINDOW_MS - now);
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    const resetTime = oldestTimestamp + WINDOW_MS;

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      resetTime,
    };
  }

  // Record this request
  timestamps.push(now);
  ipStore.set(ip, timestamps);

  const remaining = MAX_REQUESTS - timestamps.length;
  const oldestTimestamp = timestamps[0];
  const resetTime = oldestTimestamp + WINDOW_MS;

  return {
    allowed: true,
    remaining,
    retryAfterSeconds: 0,
    resetTime,
  };
}
