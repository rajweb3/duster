interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
}

export function createRateLimiter(name: string, config: RateLimitConfig) {
  const store = getStore(name);

  // Periodic cleanup of expired entries
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, config.windowMs);

  return {
    check(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
      const now = Date.now();
      const entry = store.get(identifier);

      if (!entry || entry.resetAt <= now) {
        store.set(identifier, { count: 1, resetAt: now + config.windowMs });
        return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
      }

      entry.count++;
      const remaining = Math.max(0, config.maxRequests - entry.count);
      const allowed = entry.count <= config.maxRequests;

      return { allowed, remaining, resetAt: entry.resetAt };
    },

    reset(identifier: string): void {
      store.delete(identifier);
    },
  };
}

// Pre-configured limiters for common endpoints
export const authLimiter = createRateLimiter('auth', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 attempts per 15 min
});

export const apiLimiter = createRateLimiter('api', {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 req/min
});

export const webhookLimiter = createRateLimiter('webhook', {
  windowMs: 60 * 1000,
  maxRequests: 100, // Stripe can send bursts
});

const TRUSTED_PROXIES = (process.env.TRUSTED_PROXY_RANGES || '127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16').split(',').map(s => s.trim());

export function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) {
    const v4 = ip.slice(7);
    if (v4.includes('.')) return v4;
  }
  return ip;
}

export function isFromTrustedProxy(ip: string): boolean {
  const normalized = normalizeIp(ip);
  return TRUSTED_PROXIES.some(range => {
    if (range.includes('/')) {
      return ipInCidr(normalized, range);
    }
    return normalized === range || ip === range;
  });
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1) >>> 0;
  const ipNum = ipToNum(ip);
  const rangeNum = ipToNum(range);
  if (ipNum === null || rangeNum === null) return false;
  return (ipNum & mask) === (rangeNum & mask);
}

export function ipToNum(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.reduce((sum, part) => (sum << 8) + parseInt(part, 10), 0) >>> 0;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  if (forwarded && realIp && isFromTrustedProxy(realIp)) {
    return normalizeIp(forwarded.split(',')[0].trim());
  }
  if (realIp) return normalizeIp(realIp);
  if (forwarded) return normalizeIp(forwarded.split(',')[0].trim());
  return '127.0.0.1';
}
