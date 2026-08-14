import { SignJWT, jwtVerify } from 'jose';
import type { IncomingMessage } from 'http';

export interface TenantToken {
  tenantId: string;
  iat: number;
  exp: number;
}

export function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export function extractTenantId(req: IncomingMessage): string | null {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  return url.searchParams.get('tenantId') || req.headers['x-tenant-id'] as string || null;
}

export async function verifyToken(token: string, secret: string): Promise<TenantToken | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      issuer: 'duster',
      audience: 'duster-ws',
    });
    if (!payload.tenantId) return null;
    return payload as unknown as TenantToken;
  } catch {
    return null;
  }
}

export async function createToken(tenantId: string, secret: string, expiresIn = '24h'): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('duster')
    .setAudience('duster-ws')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}
