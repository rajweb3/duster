import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/jwt';
import { db } from '@/db';

export async function GET() {
  const token = cookies().get('session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, payload.userId),
    columns: { id: true, email: true, name: true, role: true, tenantId: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.id, user.tenantId),
  });

  return NextResponse.json({ user, tenant });
}
