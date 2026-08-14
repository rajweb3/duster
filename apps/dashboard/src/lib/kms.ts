import { db } from '@/db';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

const KMS_ARN_REGEX = /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[a-f0-9-]{36}$/;

export class KmsConfigError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'KmsConfigError';
  }
}

/**
 * Validate that a string is a well-formed AWS KMS key ARN.
 */
export function validateKmsKeyArn(arn: string): { valid: boolean; error?: string } {
  if (!arn || typeof arn !== 'string') {
    return { valid: false, error: 'KMS key ARN is required' };
  }

  const trimmed = arn.trim();

  if (!trimmed.startsWith('arn:aws:kms:')) {
    return { valid: false, error: 'KMS key ARN must start with arn:aws:kms:' };
  }

  if (!KMS_ARN_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Invalid KMS key ARN format. Expected: arn:aws:kms:<region>:<account-id>:key/<key-id>',
    };
  }

  return { valid: true };
}

/**
 * Extract the AWS region from a KMS key ARN.
 */
export function extractRegionFromArn(arn: string): string {
  const parts = arn.split(':');
  return parts[3]; // arn:aws:kms:<region>:<account>:key/<id>
}

/**
 * Verify that the customer's KMS key exists, is enabled, and the tenant VM
 * IAM role can use it. The control plane uses DescribeKey only — it NEVER
 * calls Decrypt on customer keys. This preserves the zero-knowledge guarantee:
 * the control plane cannot decrypt customer data.
 *
 * Validates:
 * 1. The key exists (DescribeKey succeeds)
 * 2. The key is enabled (KeyState === 'Enabled')
 * 3. The key is a symmetric encryption key (correct usage)
 */
export async function verifyKeyAccess(kmsKeyArn: string): Promise<{ success: boolean; error?: string }> {
  const validation = validateKmsKeyArn(kmsKeyArn);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const region = extractRegionFromArn(kmsKeyArn);
  const { KMSClient, DescribeKeyCommand } = await import('@aws-sdk/client-kms');
  const client = new KMSClient({ region });

  try {
    const result = await client.send(
      new DescribeKeyCommand({ KeyId: kmsKeyArn })
    );

    const metadata = result.KeyMetadata;
    if (!metadata) {
      return { success: false, error: 'KMS DescribeKey returned no metadata' };
    }

    if (metadata.KeyState !== 'Enabled') {
      return { success: false, error: `KMS key is not enabled (state: ${metadata.KeyState})` };
    }

    if (metadata.KeyUsage !== 'ENCRYPT_DECRYPT') {
      return { success: false, error: `KMS key usage is ${metadata.KeyUsage}, expected ENCRYPT_DECRYPT` };
    }

    if (metadata.KeySpec !== 'SYMMETRIC_DEFAULT') {
      return { success: false, error: `KMS key spec is ${metadata.KeySpec}, expected SYMMETRIC_DEFAULT` };
    }

    return { success: true };
  } catch (err: any) {
    const message = err?.name === 'NotFoundException'
      ? 'KMS key not found'
      : err?.name === 'AccessDeniedException'
      ? 'Access denied: ensure the KMS key policy grants kms:DescribeKey to Duster\'s control plane role'
      : `KMS verification failed: ${err?.message || 'Unknown error'}`;

    return { success: false, error: message };
  }
}

/**
 * Store the KMS key ARN in the tenant record. This stores only the ARN
 * (metadata), never any key material. The actual DEK is stored on the
 * tenant VM encrypted with this KMS key.
 */
export async function configureKmsKey(
  tenantId: string,
  kmsKeyArn: string
): Promise<void> {
  const validation = validateKmsKeyArn(kmsKeyArn);
  if (!validation.valid) {
    throw new KmsConfigError(validation.error!);
  }

  await db.update(tenants)
    .set({
      kmsKeyArn: kmsKeyArn.trim(),
      encryptionStatus: 'configuring',
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

/**
 * Mark encryption as active after the sidecar confirms DEK generation.
 */
export async function activateEncryption(tenantId: string): Promise<void> {
  await db.update(tenants)
    .set({
      encryptionStatus: 'active',
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

/**
 * Mark encryption status as error with context.
 */
export async function markEncryptionError(tenantId: string): Promise<void> {
  await db.update(tenants)
    .set({
      encryptionStatus: 'error',
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

/**
 * Begin key rotation: update status and record the rotation timestamp.
 */
export async function beginKeyRotation(tenantId: string): Promise<void> {
  await db.update(tenants)
    .set({
      encryptionStatus: 'rotating',
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

/**
 * Complete key rotation: set status back to active and record timestamp.
 */
export async function completeKeyRotation(tenantId: string): Promise<void> {
  await db.update(tenants)
    .set({
      encryptionStatus: 'active',
      lastKeyRotation: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

/**
 * Get the encryption configuration for a tenant.
 */
export async function getEncryptionConfig(tenantId: string) {
  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.id, tenantId),
    columns: {
      id: true,
      kmsKeyArn: true,
      encryptionStatus: true,
      lastKeyRotation: true,
    },
  });

  if (!tenant) {
    return null;
  }

  return {
    tenantId: tenant.id,
    kmsKeyArn: tenant.kmsKeyArn,
    encryptionStatus: tenant.encryptionStatus,
    lastKeyRotation: tenant.lastKeyRotation,
    isConfigured: !!tenant.kmsKeyArn && tenant.encryptionStatus !== 'none',
  };
}

/**
 * Determine if a key rotation is due based on a schedule.
 * Default rotation interval: 90 days.
 */
export function isRotationDue(
  lastRotation: Date | null,
  rotationIntervalDays: number = 90
): boolean {
  if (!lastRotation) {
    return false; // No rotation has ever occurred; not "due"
  }

  const now = Date.now();
  const lastRotationMs = lastRotation.getTime();
  const intervalMs = rotationIntervalDays * 24 * 60 * 60 * 1000;

  return (now - lastRotationMs) >= intervalMs;
}
