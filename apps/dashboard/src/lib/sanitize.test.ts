import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeInput, sanitizeName, sanitizeEmail } from './sanitize';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#x27;s");
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('does not modify safe strings', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});

describe('sanitizeInput', () => {
  it('strips control characters', () => {
    expect(sanitizeInput('hello\x00world\x07')).toBe('helloworld');
  });

  it('preserves newlines and tabs', () => {
    expect(sanitizeInput('line1\nline2\ttab')).toBe('line1\nline2\ttab');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });
});

describe('sanitizeName', () => {
  it('removes dangerous characters', () => {
    expect(sanitizeName('John<script>')).toBe('Johnscript');
  });

  it('removes backticks and semicolons', () => {
    expect(sanitizeName('test`; DROP TABLE')).toBe('test DROP TABLE');
  });

  it('preserves normal names', () => {
    expect(sanitizeName('Alice Johnson')).toBe('Alice Johnson');
  });

  it('preserves Unicode names', () => {
    expect(sanitizeName('José García')).toBe('José García');
  });

  it('preserves names with hyphens and periods', () => {
    expect(sanitizeName('Mary-Jane O.Brien')).toBe('Mary-Jane O.Brien');
  });
});

describe('sanitizeEmail', () => {
  it('lowercases email', () => {
    expect(sanitizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('trims whitespace', () => {
    expect(sanitizeEmail('  user@test.com  ')).toBe('user@test.com');
  });
});
