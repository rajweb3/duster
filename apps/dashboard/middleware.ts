import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
if (!process.env.JWT_SECRET && !isDev) {
  throw new Error('FATAL: JWT_SECRET environment variable is required in production. Refusing to start with insecure default.');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'duster-dev-secret-change-in-production');
const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/api/auth', '/api/webhooks', '/api/billing/checkout', '/api/errors', '/onboarding', '/docs', '/terms', '/privacy'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'duster',
      audience: 'duster-dashboard',
    });

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId as string);
    requestHeaders.set('x-tenant-id', payload.tenantId as string);
    requestHeaders.set('x-user-role', payload.role as string);

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('session');
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
