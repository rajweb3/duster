import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { verifyToken } from '@/lib/auth/jwt';
import { sendVerificationEmail } from '@/lib/email';
import { authLimiter, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = authLimiter.check(`resend:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  const sessionToken = cookies().get('session')?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const payload = await verifyToken(sessionToken);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, payload.userId),
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: 'Email already verified' }, { status: 400 });
  }

  const token = randomBytes(48).toString('hex');
  await db.insert(verificationTokens).values({
    userId: user.id,
    token,
    type: 'email_verification',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await sendVerificationEmail(user.email, token, user.name);

  return NextResponse.json({ sent: true });
}
