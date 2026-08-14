import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/db';
import { connectors } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { apiLimiter, getClientIp } from '@/lib/rate-limit';

export async function GET(
  request: Request,
  { params }: { params: { tenantId: string } }
) {
  const headersList = headers();
  const userTenantId = headersList.get('x-tenant-id');

  if (userTenantId !== params.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantConnectors = await db.query.connectors.findMany({
    where: (c, { eq }) => eq(c.tenantId, params.tenantId),
  });

  return NextResponse.json(tenantConnectors);
}

const configureSchema = z.object({
  type: z.enum(['slack', 'email', 'trello', 'github', 'linear', 'notion']),
  config: z.record(z.unknown()),
});

export async function POST(
  request: Request,
  { params }: { params: { tenantId: string } }
) {
  const ip = getClientIp(request);
  const { allowed } = apiLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const headersList = headers();
  const userTenantId = headersList.get('x-tenant-id');
  const userId = headersList.get('x-user-id');

  if (userTenantId !== params.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = configureSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const existing = await db.query.connectors.findFirst({
    where: (c, { eq, and }) => and(
      eq(c.tenantId, params.tenantId),
      eq(c.type, parsed.data.type)
    ),
  });

  let connector;
  if (existing) {
    const [updated] = await db.update(connectors)
      .set({ config: parsed.data.config, status: 'connected', updatedAt: new Date() })
      .where(eq(connectors.id, existing.id))
      .returning();
    connector = updated;
  } else {
    const [created] = await db.insert(connectors).values({
      tenantId: params.tenantId,
      type: parsed.data.type,
      status: 'connected',
      config: parsed.data.config,
    }).returning();
    connector = created;
  }

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: 'connector.connected',
    resource: 'connector',
    resourceId: connector.id,
    ipAddress: ip,
    metadata: { type: parsed.data.type },
  });

  return NextResponse.json(connector, { status: existing ? 200 : 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: { tenantId: string } }
) {
  const ip = getClientIp(request);
  const headersList = headers();
  const userTenantId = headersList.get('x-tenant-id');
  const userId = headersList.get('x-user-id');

  if (userTenantId !== params.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  if (!type) {
    return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 });
  }

  const existing = await db.query.connectors.findFirst({
    where: (c, { eq, and }) => and(
      eq(c.tenantId, params.tenantId),
      eq(c.type, type)
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  }

  await db.update(connectors)
    .set({ status: 'disconnected', updatedAt: new Date() })
    .where(eq(connectors.id, existing.id));

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: 'connector.disconnected',
    resource: 'connector',
    resourceId: existing.id,
    ipAddress: ip,
    metadata: { type },
  });

  return NextResponse.json({ disconnected: true });
}
