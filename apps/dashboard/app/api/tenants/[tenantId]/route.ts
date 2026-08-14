import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { tenants, connectors, workflows } from '@/db/schema';

export async function GET(
  request: Request,
  { params }: { params: { tenantId: string } }
) {
  const headersList = headers();
  const userTenantId = headersList.get('x-tenant-id');

  if (userTenantId !== params.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.id, params.tenantId),
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const tenantConnectors = await db.query.connectors.findMany({
    where: (c, { eq }) => eq(c.tenantId, params.tenantId),
  });

  const tenantWorkflows = await db.query.workflows.findMany({
    where: (w, { eq }) => eq(w.tenantId, params.tenantId),
  });

  return NextResponse.json({
    tenant,
    connectors: tenantConnectors,
    workflows: tenantWorkflows,
  });
}
