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
 * Verify that we have access to the customer's KMS key by performing a
 * test encrypt/decrypt cycle with a dummy value. This validates that:
 * 1. The key exists
 * 2. Our IAM role has encrypt/decrypt permissions
 * 3. The key is enabled
 */
export async function verifyKeyAccess(kmsKeyArn: string): Promise<{ success: boolean; error?: string }> {
  const validation = validateKmsKeyArn(kmsKeyArn);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const region = extractRegionFromArn(kmsKeyArn);
  const { KMSClient, EncryptCommand, DecryptCommand } = await import('@aws-sdk/client-kms');
  const client = new KMSClient({ region });
  const testPlaintext = Buffer.from('duster-key-verification-test');

  try {
    // Test encrypt
    const encryptResult = await client.send(
      new EncryptCommand({
        KeyId: kmsKeyArn,
        Plaintext: testPlaintext,
      })
    );

    if (!encryptResult.CiphertextBlob) {
      return { success: false, error: 'KMS encrypt returned empty ciphertext' };
    }

    // Test decrypt
    const decryptResult = await client.send(
      new DecryptCommand({
        CiphertextBlob: encryptResult.CiphertextBlob,
        KeyId: kmsKeyArn,
      })
    );

    if (!decryptResult.Plaintext) {
      return { success: false, error: 'KMS decrypt returned empty plaintext' };
    }

    // Verify roundtrip
    const decrypted = Buffer.from(decryptResult.Plaintext);
    if (!decrypted.equals(testPlaintext)) {
      return { success: false, error: 'KMS roundtrip verification failed: data mismatch' };
    }

    return { success: true };
  } catch (err: any) {
    const message = err?.name === 'NotFoundException'
      ? 'KMS key not found'
      : err?.name === 'DisabledException'
      ? 'KMS key is disabled'
      : err?.name === 'AccessDeniedException'
      ? 'Access denied: ensure Duster\'s IAM role has kms:Encrypt and kms:Decrypt permissions on this key'
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
