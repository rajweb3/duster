import { NextResponse } from 'next/server';
import { hash } from 'bcrypt';
import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { authLimiter, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

const schema = z.object({
  token: z.string().min(32, 'Invalid reset token'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = authLimiter.check(`reset-complete:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    const record = await db.query.verificationTokens.findFirst({
      where: (t, { eq, and, isNull }) => and(
        eq(t.token, token),
        eq(t.type, 'password_reset'),
        isNull(t.usedAt),
      ),
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link' },
        { status: 400 }
      );
    }

    if (record.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Reset link has expired. Please request a new one.' },
        { status: 410 }
      );
    }

    const passwordHash = await hash(password, 12);

    await db.update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, record.userId));

    await db.update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, record.id));

    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, record.userId),
    });

    if (user) {
      await logAudit({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'user.password_reset',
        resource: 'user',
        resourceId: user.id,
        ipAddress: ip,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
