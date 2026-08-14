import { NextResponse } from 'next/server';
import { hash } from 'bcrypt';
import { randomBytes } from 'crypto';
import { db } from '@/db';
import { users, tenants, verificationTokens } from '@/db/schema';
import { createToken } from '@/lib/auth/jwt';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authLimiter, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { sanitizeName, sanitizeEmail } from '@/lib/sanitize';
import { sendVerificationEmail } from '@/lib/email';

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  name: z.string().min(1, 'Name is required').max(128),
  teamName: z.string().min(2, 'Team name must be at least 2 characters').max(64),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, remaining, resetAt } = authLimiter.check(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many signup attempts. Please try again later.' },
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
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const email = sanitizeEmail(parsed.data.email);
    const name = sanitizeName(parsed.data.name);
    const teamName = sanitizeName(parsed.data.teamName);
    const { password } = parsed.data;

    const existing = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await hash(password, 12);

    const [tenant] = await db.insert(tenants).values({
      name: teamName,
      plan: 'standard',
      status: 'provisioning',
    }).returning();

    const [user] = await db.insert(users).values({
      email,
      name,
      passwordHash,
      tenantId: tenant.id,
      role: 'owner',
    }).returning();

    // Generate email verification token
    const verifyToken = randomBytes(48).toString('hex');
    await db.insert(verificationTokens).values({
      userId: user.id,
      token: verifyToken,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    // Send verification email (non-blocking)
    sendVerificationEmail(email, verifyToken, name).catch(err =>
      console.error('Failed to send verification email:', err)
    );

    const token = await createToken({
      userId: user.id,
      tenantId: tenant.id,
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
      tenantId: tenant.id,
      userId: user.id,
      action: 'user.signup',
      resource: 'user',
      resourceId: user.id,
      ipAddress: ip,
      metadata: { email },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tenantId: tenant.id,
      emailVerificationSent: true,
    }, {
      status: 201,
      headers: { 'X-RateLimit-Remaining': String(remaining) },
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
