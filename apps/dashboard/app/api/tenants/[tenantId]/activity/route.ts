import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { eq, desc, lt, and } from 'drizzle-orm';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(
  request: Request,
  { params }: { params: { tenantId: string } }
) {
  const headersList = headers();
  const userTenantId = headersList.get('x-tenant-id');

  if (userTenantId !== params.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10),
    MAX_PAGE_SIZE
  );
  const cursor = url.searchParams.get('cursor');
  const action = url.searchParams.get('action');
  const resource = url.searchParams.get('resource');

  const conditions = [eq(auditLog.tenantId, params.tenantId)];

  if (cursor) {
    conditions.push(lt(auditLog.createdAt, new Date(cursor)));
  }
  if (action) {
    conditions.push(eq(auditLog.action, action));
  }
  if (resource) {
    conditions.push(eq(auditLog.resource, resource));
  }

  const events = await db.select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit + 1); // fetch one extra to detect hasMore

  const hasMore = events.length > limit;
  const items = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

  return NextResponse.json({
    items,
    pagination: {
      hasMore,
      nextCursor,
      limit,
    },
  });
}
