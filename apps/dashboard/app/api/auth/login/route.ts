import { NextResponse } from 'next/server';
import { compare } from 'bcrypt';
import { db } from '@/db';
import { users } from '@/db/schema';
import { createToken } from '@/lib/auth/jwt';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { authLimiter, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { sanitizeEmail } from '@/lib/sanitize';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, remaining, resetAt } = authLimiter.check(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const email = sanitizeEmail(parsed.data.email);
    const { password } = parsed.data;

    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      await logAudit({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'user.login_failed',
        resource: 'user',
        resourceId: user.id,
        ipAddress: ip,
        metadata: { reason: 'invalid_password' },
      });

      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const token = await createToken({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    cookies().set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    await logAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'user.login',
      resource: 'user',
      resourceId: user.id,
      ipAddress: ip,
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tenantId: user.tenantId,
    }, {
      headers: { 'X-RateLimit-Remaining': String(remaining) },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    const isDbError = error?.code === 'ECONNREFUSED' || error?.message?.includes('connect');
    return NextResponse.json(
      { error: isDbError ? 'Service temporarily unavailable. Please try again shortly.' : 'Internal server error' },
      { status: isDbError ? 503 : 500 }
    );
  }
}
