import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { logAudit } from '@/lib/audit';
import { apiLimiter, getClientIp } from '@/lib/rate-limit';
import { sendCommandToTenant } from '@/lib/ws/bridge';

const commandSchema = z.object({
  action: z.enum([
    'skill.activate', 'skill.deactivate',
    'connector.configure', 'connector.disconnect',
    'tool.enable', 'tool.disable',
    'memory.clear', 'agent.restart',
    'config.update',
  ]),
  payload: z.record(z.unknown()),
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
  const parsed = commandSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const commandId = randomUUID();
  const { action, payload } = parsed.data;

  const command = {
    type: 'command' as const,
    commandId,
    tenantId: params.tenantId,
    action,
    payload,
  };

  const delivered = sendCommandToTenant(params.tenantId, command);

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: 'command.sent',
    resource: 'command',
    resourceId: commandId,
    ipAddress: ip,
    metadata: { action, payload, delivered },
  });

  if (!delivered) {
    return NextResponse.json({
      sent: false,
      commandId,
      error: 'Tenant sidecar is not connected. Command will not be delivered.',
    }, { status: 503 });
  }

  return NextResponse.json({
    sent: true,
    commandId,
  });
}
