import { randomBytes, timingSafeEqual } from 'crypto';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

export function validateCsrfToken(cookieToken: string | undefined, headerToken: string | null): boolean {
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;

  try {
    const a = Buffer.from(cookieToken, 'utf8');
    const b = Buffer.from(headerToken, 'utf8');
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getCsrfCookieOptions() {
  return {
    name: CSRF_COOKIE_NAME,
    httpOnly: false, // must be readable by JS to send in header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  };
}

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
