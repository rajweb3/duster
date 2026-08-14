import { describe, it, expect, beforeEach } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('Rate Limiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter(`test-${Date.now()}`, {
      windowMs: 60000,
      maxRequests: 3,
    });
  });

  it('allows requests under the limit', () => {
    const r1 = limiter.check('user1');
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check('user1');
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check('user1');
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests over the limit', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');

    const r4 = limiter.check('user1');
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it('tracks identifiers independently', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');

    const r = limiter.check('user2');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('provides resetAt timestamp', () => {
    const before = Date.now();
    const result = limiter.check('user1');
    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeLessThanOrEqual(before + 60000 + 10);
  });

  it('reset clears the count for an identifier', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');

    expect(limiter.check('user1').allowed).toBe(false);

    limiter.reset('user1');
    expect(limiter.check('user1').allowed).toBe(true);
  });
});
