import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/db';
import { verificationTokens } from '@/db/schema';
import { z } from 'zod';
import { authLimiter, getClientIp } from '@/lib/rate-limit';
import { sendPasswordResetEmail } from '@/lib/email';
import { sanitizeEmail } from '@/lib/sanitize';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = authLimiter.check(`reset:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const email = sanitizeEmail(parsed.data.email);

    // Always return success to prevent email enumeration
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    });

    if (user) {
      const token = randomBytes(48).toString('hex');
      await db.insert(verificationTokens).values({
        userId: user.id,
        token,
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });

      await sendPasswordResetEmail(email, token, user.name);
    }

    return NextResponse.json({
      message: 'If an account with that email exists, we sent a password reset link.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
