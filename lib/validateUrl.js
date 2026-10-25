/**
 * @file validateUrl.js
 * Comprehensive SSRF (Server-Side Request Forgery) protection and URL validation.
 *
 * DNS Rebinding Risk Note:
 * A time-of-check to time-of-use (TOCTOU) DNS rebinding vulnerability occurs when a
 * malicious domain resolves to a public IP during initial validation, but subsequent
 * DNS lookups by the browser resolve to an internal private IP (e.g. 169.254.169.254
 * or 127.0.0.1).
 *
 * To mitigate this risk:
 * 1. We perform full pre-flight validation on the target URL before launching/navigating.
 * 2. We enable Puppeteer request interception on EVERY outgoing request (main document,
 *    HTTP redirects, iframes, stylesheets, fetch, subresources).
 * 3. Each intercepted request destination is re-evaluated using `assertSafeUrl()`.
 *    A per-request DNS cache prevents excessive latency while ensuring any new hostname
 *    or redirected endpoint is strictly validated against private IP ranges.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Maximum allowed URL length to prevent buffer exhaustion and ReDoS.
 */
const MAX_URL_LENGTH = 2048;

/**
 * Allowed URL protocols. Strictly HTTP and HTTPS only.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Allowed TCP ports. Only standard web ports 80 and 443 are permitted.
 */
const ALLOWED_PORTS = new Set(['', '80', '443']);

/**
 * Blocked hostname patterns (internal, local, and metadata endpoints).
 */
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localdomain$/i,
  /\.lan$/i,
  /\.home$/i,
  /\.corp$/i,
  /\.test$/i,
  /\.invalid$/i,
  /^metadata\.google\.internal$/i,
  /^instance-data$/i,
];

/**
 * Checks if a 32-bit unsigned integer falls inside a CIDR subnet.
 * @param {number} ipInt 
 * @param {number} subnetInt 
 * @param {number} maskBits 
 * @returns {boolean}
 */
function inSubnet(ipInt, subnetInt, maskBits) {
  if (maskBits === 0) return true;
  const mask = ((0xFFFFFFFF << (32 - maskBits)) >>> 0);
  return (ipInt & mask) === (subnetInt & mask);
}

/**
 * Converts standard dotted-decimal IPv4 string (e.g. "192.168.1.1") to 32-bit unsigned integer.
 * Returns null if not strictly valid 4-octet canonical decimal without leading zeros.
 * @param {string} ip
 * @returns {number|null}
 */
function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let intVal = 0;
  for (let i = 0; i < 4; i++) {
    const part = parts[i];
    // Reject empty, non-digit, or leading zeros (e.g. "01", "00")
    if (!/^\d+$/.test(part)) return null;
    if (part.length > 1 && part.startsWith('0')) return null;

    const num = Number(part);
    if (num < 0 || num > 255) return null;
    intVal = ((intVal << 8) | num) >>> 0;
  }
  return intVal;
}

/**
 * Checks whether an IPv4 address belongs to private, loopback, link-local,
 * multicast, or reserved ranges.
 * @param {string} ip
 * @returns {boolean} true if private/reserved (unsafe)
 */
export function isPrivateOrReservedIPv4(ip) {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) {
    // If it cannot be parsed as canonical dotted-decimal, treat as unsafe
    return true;
  }

  // 0.0.0.0/8 (Current network / "this host")
  if (inSubnet(ipInt, 0x00000000, 8)) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (inSubnet(ipInt, 0x0A000000, 8)) return true;

  // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
  if (inSubnet(ipInt, 0x64400000, 10)) return true;

  // 127.0.0.0/8 (Loopback)
  if (inSubnet(ipInt, 0x7F000000, 8)) return true;

  // 169.254.0.0/16 (Link-local / AWS & GCP cloud metadata 169.254.169.254)
  if (inSubnet(ipInt, 0xA9FE0000, 16)) return true;

  // 172.16.0.0/12 (Private RFC 1918)
  if (inSubnet(ipInt, 0xAC100000, 12)) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (inSubnet(ipInt, 0xC0000000, 24)) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (inSubnet(ipInt, 0xC0000200, 24)) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast)
  if (inSubnet(ipInt, 0xC0586300, 24)) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (inSubnet(ipInt, 0xC0A80000, 16)) return true;

  // 198.18.0.0/15 (Network benchmark tests)
  if (inSubnet(ipInt, 0xC6120000, 15)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (inSubnet(ipInt, 0xC6336400, 24)) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (inSubnet(ipInt, 0xCB007100, 24)) return true;

  // 224.0.0.0/4 (Multicast 224.0.0.0 to 239.255.255.255)
  if (inSubnet(ipInt, 0xE0000000, 4)) return true;

  // 240.0.0.0/4 (Reserved / Future use & Broadcast 255.255.255.255)
  if (inSubnet(ipInt, 0xF0000000, 4)) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to private, loopback, link-local,
 * multicast, or IPv4-mapped private ranges.
 * @param {string} ip
 * @returns {boolean} true if private/reserved (unsafe)
 */
export function isPrivateOrReservedIPv6(ip) {
  const normalized = ip.toLowerCase().trim();

  // IPv4-mapped IPv6 addresses (e.g. ::ffff:192.168.1.1 or ::ffff:c0a8:0101)
  const ipv4MappedMatch = normalized.match(/::ffff:(?:0:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (ipv4MappedMatch) {
    return isPrivateOrReservedIPv4(ipv4MappedMatch[1]);
  }

  // Exact matches
  if (normalized === '::' || normalized === '::1' || normalized === '0:0:0:0:0:0:0:0' || normalized === '0:0:0:0:0:0:0:1') {
    return true;
  }

  // Check prefix patterns:
  // fc00::/7 (Unique local addresses - fc00:: to fdff::)
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized) || normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // fe80::/10 (Link-local unicast - fe80:: to febf::)
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) {
    return true;
  }

  // ff00::/8 (Multicast)
  if (/^ff[0-9a-f]{2}:/i.test(normalized)) {
    return true;
  }

  // 2001:db8::/32 (Documentation prefix)
  if (normalized.startsWith('2001:db8:') || normalized === '2001:db8::') {
    return true;
  }

  return false;
}

/**
 * Checks if a string is a numeric or ambiguous IP format designed to bypass filters
 * (e.g. dword "http://2130706433", octal "http://0177.0.0.1", hex "http://0x7f.1").
 * @param {string} host
 * @returns {boolean} true if suspicious/non-standard format
 */
function isSuspiciousNumericHost(host) {
  // Pure integer hostname (e.g. "2130706433")
  if (/^\d+$/.test(host)) return true;

  // Hexadecimal notation (e.g. "0x7f000001" or "0x7f.0.0.1")
  if (/^0x[0-9a-f]+/i.test(host) || /\b0x[0-9a-f]+/i.test(host)) return true;

  // Dotted notation containing octal leading zeros or non-decimal parts (e.g. "0177.0.0.1")
  if (/^[\d.]+$/.test(host)) {
    const parts = host.split('.');
    if (parts.length !== 4) return true; // non-standard octet count (e.g. "127.1")
    for (const p of parts) {
      if (p.length > 1 && p.startsWith('0')) return true; // octal trick
      const n = Number(p);
      if (isNaN(n) || n < 0 || n > 255) return true;
    }
  }

  return false;
}

/**
 * Resolves a hostname to all IPv4 and IPv6 addresses with in-memory caching per request.
 * @param {string} host
 * @param {Map<string, Array<{address: string, family: number}> | Promise<Array<{address: string, family: number}>>} [cache]
 * @returns {Promise<Array<{address: string, family: number}>>}
 */
export async function resolveHost(host, cache) {
  if (cache && cache.has(host)) {
    return await cache.get(host);
  }

  const lookup = dns.lookup(host, { all: true, verbatim: true });
  if (cache) cache.set(host, lookup);
  try {
    const records = await lookup;
    if (cache) cache.set(host, records);
    return records;
  } catch (error) {
    throw error;
  }
}

/**
 * Validates a target URL against SSRF and syntax rules.
 * Throws a descriptive Error with an appropriate HTTP status code code if invalid or unsafe.
 *
 * @param {string} inputUrl - The URL to validate.
 * @param {Map<string, any>} [dnsCache] - Optional per-request DNS cache.
 * @returns {Promise<{ url: URL, hostname: string }>} Validated URL object.
 */
export async function assertSafeUrl(inputUrl, dnsCache = new Map()) {
  if (typeof inputUrl !== 'string') {
    const err = new Error('URL must be a valid string.');
    err.statusCode = 400;
    throw err;
  }

  const trimmed = inputUrl.trim();

  if (!trimmed) {
    const err = new Error('Please enter a website URL.');
    err.statusCode = 400;
    throw err;
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    const err = new Error(`URL exceeds maximum length of ${MAX_URL_LENGTH} characters.`);
    err.statusCode = 400;
    throw err;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    const err = new Error('The URL provided is malformed or invalid.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Check protocol
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    const err = new Error(`Protocol '${parsed.protocol}' is forbidden. Only HTTP and HTTPS are permitted.`);
    err.statusCode = 400;
    throw err;
  }

  // 2. Reject credentials (username/password in URL)
  if (parsed.username || parsed.password) {
    const err = new Error('URLs with embedded credentials (user:pass@host) are forbidden.');
    err.statusCode = 400;
    throw err;
  }

  // 3. Port check
  if (!ALLOWED_PORTS.has(parsed.port)) {
    const err = new Error(`Port '${parsed.port}' is blocked. Only standard web ports (80 and 443) are allowed.`);
    err.statusCode = 400;
    throw err;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!hostname) {
    const err = new Error('URL hostname cannot be empty.');
    err.statusCode = 400;
    throw err;
  }

  // 4. Reject suspicious numeric/octal/hex IP notations
  if (isSuspiciousNumericHost(hostname)) {
    const err = new Error('Non-standard numeric, octal, or hexadecimal IP address hostnames are forbidden.');
    err.statusCode = 403;
    throw err;
  }

  // 5. Hostname pattern checks (localhost, .local, internal domains)
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      const err = new Error(`Access to internal/private hostname '${hostname}' is forbidden.`);
      err.statusCode = 403;
      throw err;
    }
  }

  // 6. Bare hostname check: unless it's a valid public IP, require at least one dot
  const ipType = net.isIP(hostname);
  if (ipType === 0 && !hostname.includes('.')) {
    const err = new Error(`Single-label internal hostname '${hostname}' is not allowed.`);
    err.statusCode = 400;
    throw err;
  }

  // 7. If hostname is directly an IP literal:
  if (ipType === 4) {
    if (isPrivateOrReservedIPv4(hostname)) {
      const err = new Error(`Access to private/reserved IPv4 address '${hostname}' is forbidden.`);
      err.statusCode = 403;
      throw err;
    }
    return { url: parsed, hostname };
  }

  if (ipType === 6) {
    // Strip surrounding brackets for IPv6 URL hostname
    const cleanIpv6 = hostname.replace(/^\[|\]$/g, '');
    if (isPrivateOrReservedIPv6(cleanIpv6)) {
      const err = new Error(`Access to private/reserved IPv6 address '${hostname}' is forbidden.`);
      err.statusCode = 403;
      throw err;
    }
    return { url: parsed, hostname };
  }

  // 8. Hostname DNS resolution and IP verification
  let records;
  try {
    records = await resolveHost(hostname, dnsCache);
  } catch (dnsErr) {
    const err = new Error(`Unable to resolve hostname '${hostname}': ${dnsErr.message || 'DNS lookup failed'}`);
    err.statusCode = 502;
    throw err;
  }

  if (!records || records.length === 0) {
    const err = new Error(`No DNS records found for host '${hostname}'.`);
    err.statusCode = 502;
    throw err;
  }

  for (const record of records) {
    const addr = record.address;
    if (record.family === 4 || net.isIPv4(addr)) {
      if (isPrivateOrReservedIPv4(addr)) {
        const err = new Error(`Host '${hostname}' resolves to blocked private address: ${addr}`);
        err.statusCode = 403;
        throw err;
      }
    } else if (record.family === 6 || net.isIPv6(addr)) {
      if (isPrivateOrReservedIPv6(addr)) {
        const err = new Error(`Host '${hostname}' resolves to blocked private IPv6 address: ${addr}`);
        err.statusCode = 403;
        throw err;
      }
    }
  }

  return { url: parsed, hostname };
}
