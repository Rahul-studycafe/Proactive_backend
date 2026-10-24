/**
 * Utility to match client IP against exact IPs or CIDR subnet blocks
 * Supports IPv4, IPv4-mapped IPv6, and standard CIDR notation.
 */

function normalizeIp(ip: string): string {
  let cleaned = ip.trim();
  // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:192.168.1.1)
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.substring(7);
  }
  return cleaned;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) + n;
  }
  // Convert to unsigned 32-bit int
  return num >>> 0;
}

function isIpv4InCidr(ip: string, cidr: string): boolean {
  const [rangeIp, prefixStr] = cidr.split('/');
  if (!rangeIp || !prefixStr) return false;

  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipv4ToInt(normalizeIp(ip));
  const rangeInt = ipv4ToInt(normalizeIp(rangeIp));

  if (ipInt === null || rangeInt === null) return false;

  if (prefix === 0) return true;

  const mask = ((0xffffffff << (32 - prefix)) >>> 0);
  return (ipInt & mask) === (rangeInt & mask);
}

/**
 * Checks if a given client IP is within a whitelist of exact IPs or CIDR blocks.
 */
export function isIpInWhitelist(clientIp: string, whitelist: string[]): boolean {
  if (!clientIp || !Array.isArray(whitelist) || whitelist.length === 0) {
    return false;
  }

  const normalizedClient = normalizeIp(clientIp);

  // Auto-allow localhost / loopback during local development & testing
  if (
    normalizedClient === '127.0.0.1' ||
    normalizedClient === '::1' ||
    normalizedClient === 'localhost'
  ) {
    return true;
  }

  for (const entry of whitelist) {
    const cleanedEntry = normalizeIp(entry);
    if (!cleanedEntry) continue;

    if (cleanedEntry.includes('/')) {
      // CIDR notation
      if (isIpv4InCidr(normalizedClient, cleanedEntry)) {
        return true;
      }
    } else {
      // Exact IP match
      if (normalizedClient === cleanedEntry) {
        return true;
      }
    }
  }

  return false;
}
