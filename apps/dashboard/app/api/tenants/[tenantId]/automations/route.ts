import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/db';
import { schedules } from '@/db/schema';
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

  const tenantSchedules = await db.query.schedules.findMany({
    where: (s, { eq }) => eq(s.tenantId, params.tenantId),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });

  return NextResponse.json(tenantSchedules);
}

const createScheduleSchema = z.object({
  skillId: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  cron: z.string().min(9).max(64),
  enabled: z.boolean().default(true),
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
  const parsed = createScheduleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const cronParts = parsed.data.cron.trim().split(/\s+/);
  if (cronParts.length !== 5) {
    return NextResponse.json({ error: 'Invalid cron expression: must have 5 fields' }, { status: 400 });
  }

  const nextRun = computeNextRun(parsed.data.cron);

  const [schedule] = await db.insert(schedules).values({
    tenantId: params.tenantId,
    skillId: parsed.data.skillId,
    name: parsed.data.name,
    cron: parsed.data.cron,
    status: parsed.data.enabled ? 'active' : 'paused',
    nextRunAt: nextRun,
  }).returning();

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: 'schedule.created',
    resource: 'schedule',
    resourceId: schedule.id,
    ipAddress: ip,
    metadata: { skillId: parsed.data.skillId, cron: parsed.data.cron },
  });

  return NextResponse.json(schedule, { status: 201 });
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
  const scheduleId = url.searchParams.get('id');
  if (!scheduleId) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const existing = await db.query.schedules.findFirst({
    where: (s, { eq, and }) => and(
      eq(s.id, scheduleId),
      eq(s.tenantId, params.tenantId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }

  await db.delete(schedules).where(eq(schedules.id, scheduleId));

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: 'schedule.deleted',
    resource: 'schedule',
    resourceId: scheduleId,
    ipAddress: ip,
    metadata: { skillId: existing.skillId },
  });

  return NextResponse.json({ deleted: true });
}

function computeNextRun(cron: string): Date {
  const parts = cron.trim().split(/\s+/);
  const now = new Date();
  const next = new Date(now);

  const minute = parts[0] === '*' ? now.getMinutes() : parseInt(parts[0]);
  const hour = parts[1] === '*' ? now.getHours() : parseInt(parts[1]);

  next.setMinutes(minute);
  next.setSeconds(0);
  next.setMilliseconds(0);

  if (parts[1] !== '*') {
    next.setHours(hour);
  }

  if (next <= now) {
    if (parts[0] !== '*' && parts[1] === '*') {
      next.setHours(next.getHours() + 1);
    } else if (parts[1] !== '*') {
      next.setDate(next.getDate() + 1);
    } else {
      next.setMinutes(next.getMinutes() + 1);
    }
  }

  return next;
}
