import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateCsrfToken, getCsrfCookieOptions, CSRF_COOKIE_NAME } from '@/lib/csrf';

export async function GET() {
  const token = generateCsrfToken();

  const opts = getCsrfCookieOptions();
  cookies().set(CSRF_COOKIE_NAME, token, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    maxAge: opts.maxAge,
  });

  return NextResponse.json({ token });
}
