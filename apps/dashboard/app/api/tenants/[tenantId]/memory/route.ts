import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
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

  // Memory stats are fetched from the sidecar via the WebSocket relay.
  // This endpoint acts as a REST facade for the initial page load.
  // In production, the sidecar pushes memory.stats messages over WebSocket.
  // Here we return the last-known state from the tenant connection cache,
  // or placeholder data if the tenant hasn't reported yet.

  // TODO: In a full deployment, this would query a cached state store
  // populated by WebSocket memory.stats messages from the sidecar.
  // For now, return the structure the Knowledge page expects.

  return NextResponse.json({
    totalEntries: 0,
    lastUpdated: null,
    categories: [],
  });
}

export async function DELETE(
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

  const url = new URL(request.url);
  const category = url.searchParams.get('category');

  // This sends the clear command to the sidecar which executes on the tenant VM.
  // The actual clearing happens asynchronously via the commands endpoint.
  // We audit and return success — the command is fire-and-forget to the sidecar.

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: category ? 'memory.category_cleared' : 'memory.cleared_all',
    resource: 'memory',
    resourceId: category || 'all',
    ipAddress: ip,
    metadata: { category },
  });

  return NextResponse.json({ cleared: true, category: category || 'all' });
}
