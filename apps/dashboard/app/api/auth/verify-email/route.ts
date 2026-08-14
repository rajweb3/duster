import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token || token.length < 32) {
    return NextResponse.json({ error: 'Invalid verification link' }, { status: 400 });
  }

  const record = await db.query.verificationTokens.findFirst({
    where: (t, { eq, and, isNull }) => and(
      eq(t.token, token),
      eq(t.type, 'email_verification'),
      isNull(t.usedAt),
    ),
  });

  if (!record) {
    return NextResponse.json({ error: 'Invalid or expired verification link' }, { status: 400 });
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Verification link has expired. Please request a new one.' }, { status: 410 });
  }

  // Mark email as verified
  await db.update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, record.userId));

  // Mark token as used
  await db.update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.id, record.id));

  // Redirect to dashboard with success message
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.redirect(`${appUrl}/overview?verified=true`);
}
