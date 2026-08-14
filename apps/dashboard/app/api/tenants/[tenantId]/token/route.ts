import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { jwtVerify } from 'jose';
import { createToken } from '@/lib/ws/auth';
import { logAudit } from '@/lib/audit';
import { apiLimiter, getClientIp } from '@/lib/rate-limit';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
if (!process.env.JWT_SECRET && !isDev) {
  throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
}
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
      // Re-verify signature without expiration check using a generous clockTolerance
      const graceMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      try {
        const { payload: expired } = await jwtVerify(currentToken, key, {
          issuer: 'duster',
          audience: 'duster-ws',
          clockTolerance: Math.ceil(graceMs / 1000),
        });

        if (expired.tenantId !== params.tenantId) {
          return NextResponse.json({ error: 'Token tenant mismatch' }, { status: 403 });
        }

        const expiredAt = (expired.exp || 0) * 1000;
        if (Date.now() - expiredAt > graceMs) {
          return NextResponse.json({ error: 'Token expired beyond refresh grace period' }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
  }

  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.id, params.tenantId),
  });

  if (!tenant || tenant.status === 'terminated' || tenant.status === 'suspended') {
    return NextResponse.json({ error: 'Tenant is no longer active' }, { status: 403 });
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
