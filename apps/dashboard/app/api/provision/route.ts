import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  const headersList = headers();
  const tenantId = headersList.get('x-tenant-id');
  const userRole = headersList.get('x-user-role');

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

  if (tenant.status === 'active') {
    return NextResponse.json({ error: 'Already provisioned' }, { status: 409 });
  }

  try {
    const { EC2Client, RunInstancesCommand } = await import('@aws-sdk/client-ec2');
    const ec2 = new EC2Client({ region: process.env.AWS_REGION || 'us-east-1' });

    const command = new RunInstancesCommand({
      ImageId: process.env.DUSTER_AMI_ID,
      InstanceType: 'g6.xlarge',
      MinCount: 1,
      MaxCount: 1,
      SubnetId: process.env.PRIVATE_SUBNET_ID,
      SecurityGroupIds: [process.env.TENANT_SECURITY_GROUP_ID!],
      IamInstanceProfile: { Name: process.env.TENANT_INSTANCE_PROFILE! },
      MetadataOptions: {
        HttpTokens: 'required',
        HttpEndpoint: 'enabled',
      },
      BlockDeviceMappings: [{
        DeviceName: '/dev/xvda',
        Ebs: {
          VolumeSize: 100,
          VolumeType: 'gp3',
          Encrypted: true,
          DeleteOnTermination: true,
        },
      }],
      TagSpecifications: [{
        ResourceType: 'instance',
        Tags: [
          { Key: 'Name', Value: `duster-tenant-${tenantId}` },
          { Key: 'Project', Value: 'duster' },
          { Key: 'TenantId', Value: tenantId },
          { Key: 'ManagedBy', Value: 'duster-provisioner' },
        ],
      }],
    });

    const result = await ec2.send(command);
    const instanceId = result.Instances?.[0]?.InstanceId;

    if (!instanceId) {
      throw new Error('No instance ID returned');
    }

    await db.update(tenants).set({
      instanceId,
      status: 'provisioning',
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    pollInstanceReady(tenantId, instanceId).catch(console.error);

    return NextResponse.json({ instanceId, status: 'provisioning' });
  } catch (error: any) {
    console.error('Provisioning error:', error);
    return NextResponse.json(
      { error: `Provisioning failed: ${error.message}` },
      { status: 500 }
    );
  }
}

async function pollInstanceReady(tenantId: string, instanceId: string) {
  const { EC2Client, DescribeInstanceStatusCommand } = await import('@aws-sdk/client-ec2');
  const client = new EC2Client({ region: process.env.AWS_REGION || 'us-east-1' });

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));

    try {
      const status = await client.send(new DescribeInstanceStatusCommand({
        InstanceIds: [instanceId],
      }));

      const instance = status.InstanceStatuses?.[0];
      if (
        instance?.InstanceState?.Name === 'running' &&
        instance?.InstanceStatus?.Status === 'ok' &&
        instance?.SystemStatus?.Status === 'ok'
      ) {
        await db.update(tenants).set({
          status: 'active',
          provisionedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(tenants.id, tenantId));
        return;
      }
    } catch {
      // Continue polling
    }
  }

  console.error(`Provisioning timeout for tenant ${tenantId}`);
}
