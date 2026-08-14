import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { jwtVerify } from 'jose';
import { createToken } from '@/lib/ws/auth';
import { logAudit } from '@/lib/audit';
import { apiLimiter, getClientIp } from '@/lib/rate-limit';

const JWT_SECRET = process.env.JWT_SECRET || 'duster-dev-secret-change-in-production';

export async function POST(
  request: Request,
  { params }: { params: { tenantId: string } },
) {
  const ip = getClientIp(request);
  const { allowed } = apiLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const headersList = headers();
  const authHeader = headersList.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
  }

  const currentToken = authHeader.slice(7);
  const key = new TextEncoder().encode(JWT_SECRET);

  try {
    const { payload } = await jwtVerify(currentToken, key, {
      issuer: 'duster',
      audience: 'duster-ws',
    });

    if (payload.tenantId !== params.tenantId) {
      return NextResponse.json({ error: 'Token tenant mismatch' }, { status: 403 });
    }
  } catch (err: any) {
    if (err?.code === 'ERR_JWT_EXPIRED') {
      const { decodeJwt } = await import('jose');
      const expired = decodeJwt(currentToken);
      if (expired.tenantId !== params.tenantId) {
        return NextResponse.json({ error: 'Token tenant mismatch' }, { status: 403 });
      }

      const expiredAt = (expired.exp || 0) * 1000;
      const graceMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (Date.now() - expiredAt > graceMs) {
        return NextResponse.json({ error: 'Token expired beyond refresh grace period' }, { status: 401 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
  }

  const newToken = await createToken(params.tenantId, JWT_SECRET, '24h');

  await logAudit({
    tenantId: params.tenantId,
    action: 'token.refreshed',
    resource: 'ws_token',
    resourceId: params.tenantId,
    ipAddress: ip,
  });

  return NextResponse.json({
    token: newToken,
    expiresIn: 86400,
  });
}
