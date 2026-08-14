import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';
import { generateTenantCertificate, getCaCertPem } from '@/lib/mtls';
import { TenantProvisioner, loadProvisionerConfig } from '@duster/provisioner';

let provisioner: TenantProvisioner | null = null;

function getProvisioner(): TenantProvisioner {
  if (!provisioner) {
    const config = loadProvisionerConfig();
    provisioner = new TenantProvisioner(config);
  }
  return provisioner;
}

export async function POST(request: Request) {
  const headersList = headers();
  const tenantId = headersList.get('x-tenant-id');
  const userRole = headersList.get('x-user-role');
  const userId = headersList.get('x-user-id');

  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can provision' }, { status: 403 });
  }

  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.id, tenantId),
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  if (tenant.status === 'active' || tenant.status === 'provisioning') {
    return NextResponse.json({ error: 'Already provisioned or in progress' }, { status: 409 });
  }

  try {
    const [locked] = await db.update(tenants).set({
      status: 'provisioning',
      updatedAt: new Date(),
    }).where(
      and(
        eq(tenants.id, tenantId),
        notInArray(tenants.status, ['active', 'provisioning']),
      ),
    ).returning();

    if (!locked) {
      return NextResponse.json({ error: 'Provisioning already in progress' }, { status: 409 });
    }

    const certBundle = generateTenantCertificate(tenantId);

    const prov = getProvisioner();
    const result = await prov.provision(tenantId, {
      tlsCert: certBundle.certificate,
      tlsKey: certBundle.privateKey,
      tlsCa: getCaCertPem() || undefined,
    });

    if (!result.success || !result.instance) {
      await db.update(tenants).set({
        status: 'suspended',
        updatedAt: new Date(),
      }).where(eq(tenants.id, tenantId));

      return NextResponse.json(
        { error: 'Provisioning failed. Please try again or contact support.' },
        { status: 500 },
      );
    }

    await db.update(tenants).set({
      instanceId: result.instance.instanceId,
      status: 'active',
      provisionedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    await logAudit({
      tenantId,
      userId: userId || undefined,
      action: 'tenant.provisioned',
      resource: 'instance',
      resourceId: result.instance.instanceId,
      metadata: {
        privateIp: result.instance.privateIp,
        certSerial: certBundle.serialNumber,
      },
    });

    return NextResponse.json({
      instanceId: result.instance.instanceId,
      status: 'active',
      privateIp: result.instance.privateIp,
    });
  } catch (error: any) {
    console.error('Provisioning error:', error);

    await db.update(tenants).set({
      status: 'suspended',
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    return NextResponse.json(
      { error: 'Provisioning failed. Please try again or contact support.' },
      { status: 500 },
    );
  }
}
