import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/db';
import { workflows } from '@/db/schema';
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

  const tenantWorkflows = await db.query.workflows.findMany({
    where: (w, { eq }) => eq(w.tenantId, params.tenantId),
    orderBy: (w, { desc }) => [desc(w.createdAt)],
  });

  return NextResponse.json(tenantWorkflows);
}

const createWorkflowSchema = z.object({
  skillId: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  config: z.record(z.unknown()).optional(),
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
  const parsed = createWorkflowSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  // Check for duplicate active workflow with same skillId
  const existing = await db.query.workflows.findFirst({
    where: (w, { eq, and }) => and(
      eq(w.tenantId, params.tenantId),
      eq(w.skillId, parsed.data.skillId),
    ),
  });

  if (existing && existing.status === 'active') {
    return NextResponse.json(
      { error: 'This workflow is already active' },
      { status: 409 }
    );
  }

  const [workflow] = await db.insert(workflows).values({
    tenantId: params.tenantId,
    skillId: parsed.data.skillId,
    name: parsed.data.name,
    status: 'active',
    config: parsed.data.config || {},
  }).returning();

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: 'workflow.activated',
    resource: 'workflow',
    resourceId: workflow.id,
    ipAddress: ip,
    metadata: { skillId: parsed.data.skillId, name: parsed.data.name },
  });

  return NextResponse.json(workflow, { status: 201 });
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
  const skillId = url.searchParams.get('skillId');
  if (!skillId) {
    return NextResponse.json({ error: 'Missing skillId parameter' }, { status: 400 });
  }

  const existing = await db.query.workflows.findFirst({
    where: (w, { eq, and }) => and(
      eq(w.tenantId, params.tenantId),
      eq(w.skillId, skillId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  await db.update(workflows)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(workflows.id, existing.id));

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: 'workflow.deactivated',
    resource: 'workflow',
    resourceId: existing.id,
    ipAddress: ip,
    metadata: { skillId },
  });

  return NextResponse.json({ deactivated: true });
}
