import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
  type GenerateDataKeyCommandOutput,
  type DecryptCommandOutput,
} from '@aws-sdk/client-kms';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_SPEC = 'AES_256';

export interface WrappedDataKey {
  /** Base64-encoded ciphertext blob (encrypted DEK) */
  encryptedKey: string;
  /** Key ARN used for wrapping */
  kmsKeyArn: string;
  /** Timestamp of key generation */
  generatedAt: number;
}

export interface EncryptedPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded authentication tag */
  authTag: string;
  /** Optional associated data used during encryption (not secret) */
  aad?: string;
}

export class EncryptionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EncryptionError';
  }
}

let kmsClient: KMSClient | null = null;

function getKmsClient(region?: string): KMSClient {
  if (!kmsClient) {
    kmsClient = new KMSClient({ region: region || process.env.AWS_REGION || 'us-east-1' });
  }
  return kmsClient;
}

/** Visible for testing: override the KMS client instance */
export function setKmsClient(client: KMSClient): void {
  kmsClient = client;
}

/** Visible for testing: reset the KMS client */
export function resetKmsClient(): void {
  kmsClient = null;
}

/**
 * Generate a new data encryption key (DEK) using AWS KMS envelope encryption.
 * The plaintext key is returned for immediate use; the encrypted (wrapped) key
 * is returned for storage. Duster's control plane never sees the plaintext key.
 */
export async function generateDataKey(
  kmsKeyArn: string,
  region?: string
): Promise<{ plaintextKey: Buffer; wrappedKey: WrappedDataKey }> {
  if (!kmsKeyArn || !kmsKeyArn.startsWith('arn:aws:kms:')) {
    throw new EncryptionError('Invalid KMS key ARN format');
  }

  const client = getKmsClient(region);

  let response: GenerateDataKeyCommandOutput;
  try {
    response = await client.send(
      new GenerateDataKeyCommand({
        KeyId: kmsKeyArn,
        KeySpec: KEY_SPEC,
      })
    );
  } catch (err) {
    throw new EncryptionError('Failed to generate data key via KMS', err);
  }

  if (!response.Plaintext || !response.CiphertextBlob) {
    throw new EncryptionError('KMS returned incomplete response: missing key material');
  }

  const plaintextKey = Buffer.from(response.Plaintext);
  const encryptedKey = Buffer.from(response.CiphertextBlob).toString('base64');

  return {
    plaintextKey,
    wrappedKey: {
      encryptedKey,
      kmsKeyArn,
      generatedAt: Date.now(),
    },
  };
}

/**
 * Unwrap (decrypt) a previously wrapped DEK using the customer's KMS key.
 * This call goes to AWS KMS; the plaintext DEK is returned only in-memory
 * on the tenant VM. Duster's control plane never has access.
 */
export async function unwrapDataKey(
  wrappedDek: WrappedDataKey,
  kmsKeyArn: string,
  region?: string
): Promise<Buffer> {
  if (!wrappedDek.encryptedKey) {
    throw new EncryptionError('Wrapped DEK is empty');
  }

  const client = getKmsClient(region);
  const ciphertextBlob = Buffer.from(wrappedDek.encryptedKey, 'base64');

  let response: DecryptCommandOutput;
  try {
    response = await client.send(
      new DecryptCommand({
        CiphertextBlob: ciphertextBlob,
        KeyId: kmsKeyArn,
      })
    );
  } catch (err) {
    throw new EncryptionError('Failed to unwrap data key via KMS', err);
  }

  if (!response.Plaintext) {
    throw new EncryptionError('KMS decrypt returned empty plaintext');
  }

  return Buffer.from(response.Plaintext);
}

/**
 * Encrypt data at rest using AES-256-GCM with the plaintext DEK.
 * Each invocation uses a unique random IV to ensure ciphertext non-determinism.
 *
 * @param plaintext - Data to encrypt (string or Buffer)
 * @param dek - 32-byte plaintext data encryption key
 * @param aad - Optional additional authenticated data (e.g. tenant ID)
 */
export function encryptData(
  plaintext: string | Buffer,
  dek: Buffer,
  aad?: string
): EncryptedPayload {
  if (!dek || dek.length !== 32) {
    throw new EncryptionError('DEK must be exactly 32 bytes (256 bits)');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv, { authTagLength: AUTH_TAG_LENGTH });

  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf-8'));
  }

  const input = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf-8') : plaintext;
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ...(aad ? { aad } : {}),
  };
}

/**
 * Decrypt data at rest using AES-256-GCM with the plaintext DEK.
 *
 * @param payload - Encrypted payload containing ciphertext, IV, and auth tag
 * @param dek - 32-byte plaintext data encryption key
 * @returns Decrypted data as a Buffer
 */
export function decryptData(payload: EncryptedPayload, dek: Buffer): Buffer {
  if (!dek || dek.length !== 32) {
    throw new EncryptionError('DEK must be exactly 32 bytes (256 bits)');
  }

  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new EncryptionError(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new EncryptionError(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, dek, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  if (payload.aad) {
    decipher.setAAD(Buffer.from(payload.aad, 'utf-8'));
  }

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new EncryptionError('Decryption failed: authentication tag mismatch or corrupted data', err);
  }
}

/**
 * Rotate the data encryption key. Generates a new DEK via KMS and returns both
 * the new plaintext key and the new wrapped key for storage. The caller is
 * responsible for re-encrypting existing data with the new key.
 *
 * @param kmsKeyArn - Customer's KMS key ARN
 * @param region - AWS region override
 * @returns New plaintext key and wrapped key
 */
export async function rotateDataKey(
  kmsKeyArn: string,
  region?: string
): Promise<{ plaintextKey: Buffer; wrappedKey: WrappedDataKey }> {
  // Rotation is simply generating a new key. The old wrapped key should be
  // retained until all data encrypted with it has been re-encrypted.
  return generateDataKey(kmsKeyArn, region);
}
