import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiLimiter, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import {
  validateKmsKeyArn,
  verifyKeyAccess,
  configureKmsKey,
  getEncryptionConfig,
  beginKeyRotation,
  completeKeyRotation,
  markEncryptionError,
} from '@/lib/kms';

export async function GET(
  request: Request,
  { params }: { params: { tenantId: string } }
) {
  const headersList = headers();
  const userTenantId = headersList.get('x-tenant-id');

  if (userTenantId !== params.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const config = await getEncryptionConfig(params.tenantId);

  if (!config) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  return NextResponse.json({
    tenantId: config.tenantId,
    encryptionStatus: config.encryptionStatus,
    isConfigured: config.isConfigured,
    // Mask the KMS ARN partially for security (show region and last 8 chars of key ID)
    kmsKeyArn: config.kmsKeyArn
      ? maskKmsArn(config.kmsKeyArn)
      : null,
    lastKeyRotation: config.lastKeyRotation,
  });
}

const configureSchema = z.object({
  kmsKeyArn: z.string().min(1, 'KMS key ARN is required'),
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = configureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { kmsKeyArn } = parsed.data;

  // Validate ARN format
  const validation = validateKmsKeyArn(kmsKeyArn);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Verify we can actually use this key
  const verification = await verifyKeyAccess(kmsKeyArn);
  if (!verification.success) {
    await logAudit({
      tenantId: params.tenantId,
      userId: userId || undefined,
      action: 'encryption.configure.failed',
      resource: 'encryption',
      ipAddress: ip,
      metadata: { error: verification.error },
    });

    return NextResponse.json(
      { error: `KMS key verification failed: ${verification.error}` },
      { status: 422 }
    );
  }

  // Store the ARN and set status to configuring
  try {
    await configureKmsKey(params.tenantId, kmsKeyArn);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to configure encryption' },
      { status: 500 }
    );
  }

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: 'encryption.configured',
    resource: 'encryption',
    resourceId: params.tenantId,
    ipAddress: ip,
    metadata: { kmsKeyArn: maskKmsArn(kmsKeyArn) },
  });

  return NextResponse.json(
    {
      message: 'KMS key configured successfully. Encryption will be activated once the sidecar generates the data encryption key.',
      encryptionStatus: 'configuring',
    },
    { status: 201 }
  );
}

export async function PUT(
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

  // Get current encryption config
  const config = await getEncryptionConfig(params.tenantId);

  if (!config) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  if (!config.isConfigured) {
    return NextResponse.json(
      { error: 'Encryption is not configured. Configure a KMS key first.' },
      { status: 400 }
    );
  }

  if (config.encryptionStatus === 'rotating') {
    return NextResponse.json(
      { error: 'Key rotation is already in progress' },
      { status: 409 }
    );
  }

  if (config.encryptionStatus !== 'active') {
    return NextResponse.json(
      { error: `Cannot rotate key while encryption status is: ${config.encryptionStatus}` },
      { status: 400 }
    );
  }

  // Verify the KMS key is still accessible before initiating rotation
  const verification = await verifyKeyAccess(config.kmsKeyArn!);
  if (!verification.success) {
    await markEncryptionError(params.tenantId);

    await logAudit({
      tenantId: params.tenantId,
      userId: userId || undefined,
      action: 'encryption.rotation.failed',
      resource: 'encryption',
      ipAddress: ip,
      metadata: { error: verification.error },
    });

    return NextResponse.json(
      { error: `KMS key no longer accessible: ${verification.error}` },
      { status: 422 }
    );
  }

  // Mark rotation as in progress
  await beginKeyRotation(params.tenantId);

  await logAudit({
    tenantId: params.tenantId,
    userId: userId || undefined,
    action: 'encryption.rotation.initiated',
    resource: 'encryption',
    resourceId: params.tenantId,
    ipAddress: ip,
  });

  // In production, this would send a command to the sidecar to:
  // 1. Generate a new DEK via KMS
  // 2. Re-encrypt all data with the new DEK
  // 3. Call back to complete rotation
  // For now, we simulate immediate completion for the API contract.
  // The sidecar will call completeKeyRotation when done.

  return NextResponse.json({
    message: 'Key rotation initiated. The sidecar will re-encrypt data with a new data encryption key.',
    encryptionStatus: 'rotating',
  });
}

/**
 * Mask a KMS ARN for display purposes.
 * Shows the region and last 8 characters of the key ID.
 * Example: arn:aws:kms:us-east-1:***:key/***abc12345
 */
function maskKmsArn(arn: string): string {
  const parts = arn.split(':');
  if (parts.length < 6) return '***';

  const region = parts[3];
  const keyPart = parts[5]; // key/<uuid>
  const keyId = keyPart.replace('key/', '');
  const maskedKeyId = '***' + keyId.slice(-8);

  return `arn:aws:kms:${region}:***:key/${maskedKeyId}`;
}
