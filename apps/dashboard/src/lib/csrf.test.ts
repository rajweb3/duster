import { describe, it, expect } from 'vitest';
import { generateCsrfToken, validateCsrfToken } from './csrf';

describe('CSRF', () => {
  it('generates a 64-character hex token', () => {
    const token = generateCsrfToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('generates unique tokens', () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(t1).not.toBe(t2);
  });

  it('validates matching tokens', () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token, token)).toBe(true);
  });

  it('rejects mismatched tokens', () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(validateCsrfToken(t1, t2)).toBe(false);
  });

  it('rejects undefined cookie token', () => {
    expect(validateCsrfToken(undefined, 'some-token')).toBe(false);
  });

  it('rejects null header token', () => {
    expect(validateCsrfToken('some-token', null)).toBe(false);
  });

  it('rejects different length tokens', () => {
    expect(validateCsrfToken('short', 'longer-token')).toBe(false);
  });

  it('uses timing-safe comparison', () => {
    const token = generateCsrfToken();
    // Should not throw even with weird inputs
    expect(validateCsrfToken(token, token.slice(0, -1) + 'x')).toBe(false);
  });
});
