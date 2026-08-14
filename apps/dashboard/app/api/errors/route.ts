import { NextResponse } from 'next/server';
import { apiLimiter, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = apiLimiter.check(`errors:${ip}`);
  if (!allowed) {
    return NextResponse.json({ ok: true }); // silently drop
  }

  try {
    const body = await request.json();
    const { message, stack, componentStack } = body;

    // In production, forward to Sentry/Datadog/etc.
    console.error('[CLIENT ERROR]', {
      message,
      stack: stack?.slice(0, 500),
      componentStack: componentStack?.slice(0, 500),
      ip,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
