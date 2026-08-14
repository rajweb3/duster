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

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return '127.0.0.1';
}
