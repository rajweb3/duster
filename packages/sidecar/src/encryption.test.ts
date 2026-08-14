import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateDataKey,
  unwrapDataKey,
  encryptData,
  decryptData,
  rotateDataKey,
  setKmsClient,
  resetKmsClient,
  EncryptionError,
  type WrappedDataKey,
  type EncryptedPayload,
} from './encryption.js';
import { randomBytes } from 'node:crypto';

// --- Mock KMS Client ---

const TEST_KMS_ARN = 'arn:aws:kms:us-east-1:123456789012:key/test-key-id';
const MOCK_PLAINTEXT_KEY = randomBytes(32);
const MOCK_CIPHERTEXT_BLOB = randomBytes(64);

function createMockKmsClient(overrides: {
  generateDataKey?: () => unknown;
  decrypt?: () => unknown;
} = {}) {
  return {
    send: vi.fn(async (command: { constructor: { name: string } }) => {
      const cmdName = command.constructor.name;
      if (cmdName === 'GenerateDataKeyCommand') {
        if (overrides.generateDataKey) return overrides.generateDataKey();
        return {
          Plaintext: new Uint8Array(MOCK_PLAINTEXT_KEY),
          CiphertextBlob: new Uint8Array(MOCK_CIPHERTEXT_BLOB),
          KeyId: TEST_KMS_ARN,
        };
      }
      if (cmdName === 'DecryptCommand') {
        if (overrides.decrypt) return overrides.decrypt();
        return {
          Plaintext: new Uint8Array(MOCK_PLAINTEXT_KEY),
          KeyId: TEST_KMS_ARN,
        };
      }
      throw new Error(`Unexpected command: ${cmdName}`);
    }),
  } as any;
}

describe('encryption module', () => {
  beforeEach(() => {
    resetKmsClient();
  });

  describe('generateDataKey', () => {
    it('should generate a data key via KMS', async () => {
      const mockClient = createMockKmsClient();
      setKmsClient(mockClient);

      const result = await generateDataKey(TEST_KMS_ARN);

      expect(result.plaintextKey).toBeInstanceOf(Buffer);
      expect(result.plaintextKey.length).toBe(32);
      expect(result.wrappedKey.encryptedKey).toBeTruthy();
      expect(result.wrappedKey.kmsKeyArn).toBe(TEST_KMS_ARN);
      expect(result.wrappedKey.generatedAt).toBeGreaterThan(0);
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid KMS ARN format', async () => {
      await expect(generateDataKey('invalid-arn')).rejects.toThrow(EncryptionError);
      await expect(generateDataKey('')).rejects.toThrow(EncryptionError);
    });

    it('should throw EncryptionError when KMS is unavailable', async () => {
      const mockClient = createMockKmsClient({
        generateDataKey: () => { throw new Error('Network timeout'); },
      });
      setKmsClient(mockClient);

      await expect(generateDataKey(TEST_KMS_ARN)).rejects.toThrow(EncryptionError);
      await expect(generateDataKey(TEST_KMS_ARN)).rejects.toThrow('Failed to generate data key via KMS');
    });

    it('should throw when KMS returns incomplete response', async () => {
      const mockClient = createMockKmsClient({
        generateDataKey: () => ({ Plaintext: null, CiphertextBlob: null }),
      });
      setKmsClient(mockClient);

      await expect(generateDataKey(TEST_KMS_ARN)).rejects.toThrow('KMS returned incomplete response');
    });
  });

  describe('unwrapDataKey', () => {
    it('should decrypt a wrapped key via KMS', async () => {
      const mockClient = createMockKmsClient();
      setKmsClient(mockClient);

      const wrappedKey: WrappedDataKey = {
        encryptedKey: MOCK_CIPHERTEXT_BLOB.toString('base64'),
        kmsKeyArn: TEST_KMS_ARN,
        generatedAt: Date.now(),
      };

      const result = await unwrapDataKey(wrappedKey, TEST_KMS_ARN);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    it('should throw when wrapped DEK is empty', async () => {
      const wrappedKey: WrappedDataKey = {
        encryptedKey: '',
        kmsKeyArn: TEST_KMS_ARN,
        generatedAt: Date.now(),
      };

      await expect(unwrapDataKey(wrappedKey, TEST_KMS_ARN)).rejects.toThrow('Wrapped DEK is empty');
    });

    it('should throw EncryptionError when KMS decrypt fails', async () => {
      const mockClient = createMockKmsClient({
        decrypt: () => { throw new Error('AccessDeniedException'); },
      });
      setKmsClient(mockClient);

      const wrappedKey: WrappedDataKey = {
        encryptedKey: MOCK_CIPHERTEXT_BLOB.toString('base64'),
        kmsKeyArn: TEST_KMS_ARN,
        generatedAt: Date.now(),
      };

      await expect(unwrapDataKey(wrappedKey, TEST_KMS_ARN)).rejects.toThrow('Failed to unwrap data key via KMS');
    });

    it('should throw when KMS returns empty plaintext', async () => {
      const mockClient = createMockKmsClient({
        decrypt: () => ({ Plaintext: null }),
      });
      setKmsClient(mockClient);

      const wrappedKey: WrappedDataKey = {
        encryptedKey: MOCK_CIPHERTEXT_BLOB.toString('base64'),
        kmsKeyArn: TEST_KMS_ARN,
        generatedAt: Date.now(),
      };

      await expect(unwrapDataKey(wrappedKey, TEST_KMS_ARN)).rejects.toThrow('KMS decrypt returned empty plaintext');
    });
  });

  describe('encryptData / decryptData', () => {
    const dek = randomBytes(32);

    it('should encrypt and decrypt a string roundtrip', () => {
      const plaintext = 'Hello, Duster! This is sensitive workflow data.';
      const encrypted = encryptData(plaintext, dek);
      const decrypted = decryptData(encrypted, dek);

      expect(decrypted.toString('utf-8')).toBe(plaintext);
    });

    it('should encrypt and decrypt a Buffer roundtrip', () => {
      const plaintext = randomBytes(1024);
      const encrypted = encryptData(plaintext, dek);
      const decrypted = decryptData(encrypted, dek);

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('should encrypt and decrypt with associated data (AAD)', () => {
      const plaintext = 'Sensitive data with AAD';
      const aad = 'tenant-123';
      const encrypted = encryptData(plaintext, dek, aad);
      const decrypted = decryptData(encrypted, dek);

      expect(decrypted.toString('utf-8')).toBe(plaintext);
      expect(encrypted.aad).toBe(aad);
    });

    it('should fail decryption when AAD does not match', () => {
      const plaintext = 'Data with AAD';
      const encrypted = encryptData(plaintext, dek, 'tenant-123');

      // Tamper with the AAD
      encrypted.aad = 'tenant-456';

      expect(() => decryptData(encrypted, dek)).toThrow(EncryptionError);
    });

    it('should produce ciphertext that is not plaintext', () => {
      const plaintext = 'This should be encrypted and not readable';
      const encrypted = encryptData(plaintext, dek);

      const ciphertextBuf = Buffer.from(encrypted.ciphertext, 'base64');
      expect(ciphertextBuf.toString('utf-8')).not.toBe(plaintext);
      expect(ciphertextBuf.toString('utf-8')).not.toContain(plaintext);
    });

    it('should produce unique IVs for each encryption', () => {
      const plaintext = 'Same plaintext encrypted twice';
      const encrypted1 = encryptData(plaintext, dek);
      const encrypted2 = encryptData(plaintext, dek);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      // Ciphertexts should also differ due to different IVs
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it('should reject DEK with wrong length', () => {
      const shortKey = randomBytes(16);
      expect(() => encryptData('data', shortKey)).toThrow('DEK must be exactly 32 bytes');
      expect(() => decryptData({
        ciphertext: 'aQ==',
        iv: Buffer.alloc(12).toString('base64'),
        authTag: Buffer.alloc(16).toString('base64'),
      }, shortKey)).toThrow('DEK must be exactly 32 bytes');
    });

    it('should reject empty/null DEK', () => {
      expect(() => encryptData('data', null as any)).toThrow('DEK must be exactly 32 bytes');
      expect(() => encryptData('data', Buffer.alloc(0))).toThrow('DEK must be exactly 32 bytes');
    });

    it('should fail decryption when ciphertext is tampered', () => {
      const plaintext = 'Original data';
      const encrypted = encryptData(plaintext, dek);

      // Tamper with ciphertext
      const tamperedBuf = Buffer.from(encrypted.ciphertext, 'base64');
      tamperedBuf[0] ^= 0xff;
      encrypted.ciphertext = tamperedBuf.toString('base64');

      expect(() => decryptData(encrypted, dek)).toThrow(EncryptionError);
    });

    it('should fail decryption when auth tag is tampered', () => {
      const plaintext = 'Original data';
      const encrypted = encryptData(plaintext, dek);

      // Tamper with auth tag
      const tamperedTag = Buffer.from(encrypted.authTag, 'base64');
      tamperedTag[0] ^= 0xff;
      encrypted.authTag = tamperedTag.toString('base64');

      expect(() => decryptData(encrypted, dek)).toThrow(EncryptionError);
    });

    it('should fail decryption with wrong key', () => {
      const plaintext = 'Secret data';
      const encrypted = encryptData(plaintext, dek);
      const wrongKey = randomBytes(32);

      expect(() => decryptData(encrypted, wrongKey)).toThrow(EncryptionError);
    });

    it('should handle empty string encryption', () => {
      const plaintext = '';
      const encrypted = encryptData(plaintext, dek);
      const decrypted = decryptData(encrypted, dek);

      expect(decrypted.toString('utf-8')).toBe('');
    });

    it('should handle large data encryption', () => {
      const plaintext = randomBytes(1024 * 1024); // 1MB
      const encrypted = encryptData(plaintext, dek);
      const decrypted = decryptData(encrypted, dek);

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('should reject invalid IV length on decrypt', () => {
      const payload: EncryptedPayload = {
        ciphertext: Buffer.from('data').toString('base64'),
        iv: Buffer.alloc(8).toString('base64'), // Wrong: 8 instead of 12
        authTag: Buffer.alloc(16).toString('base64'),
      };

      expect(() => decryptData(payload, dek)).toThrow('Invalid IV length');
    });

    it('should reject invalid auth tag length on decrypt', () => {
      const payload: EncryptedPayload = {
        ciphertext: Buffer.from('data').toString('base64'),
        iv: Buffer.alloc(12).toString('base64'),
        authTag: Buffer.alloc(8).toString('base64'), // Wrong: 8 instead of 16
      };

      expect(() => decryptData(payload, dek)).toThrow('Invalid auth tag length');
    });
  });

  describe('rotateDataKey', () => {
    it('should generate a new key (delegates to generateDataKey)', async () => {
      const mockClient = createMockKmsClient();
      setKmsClient(mockClient);

      const result = await rotateDataKey(TEST_KMS_ARN);

      expect(result.plaintextKey).toBeInstanceOf(Buffer);
      expect(result.plaintextKey.length).toBe(32);
      expect(result.wrappedKey.kmsKeyArn).toBe(TEST_KMS_ARN);
      expect(result.wrappedKey.generatedAt).toBeGreaterThan(0);
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    it('should produce a different key each time', async () => {
      let callCount = 0;
      const mockClient = createMockKmsClient({
        generateDataKey: () => {
          callCount++;
          return {
            Plaintext: new Uint8Array(randomBytes(32)),
            CiphertextBlob: new Uint8Array(randomBytes(64)),
            KeyId: TEST_KMS_ARN,
          };
        },
      });
      setKmsClient(mockClient);

      const result1 = await rotateDataKey(TEST_KMS_ARN);
      const result2 = await rotateDataKey(TEST_KMS_ARN);

      expect(result1.plaintextKey.equals(result2.plaintextKey)).toBe(false);
      expect(result1.wrappedKey.encryptedKey).not.toBe(result2.wrappedKey.encryptedKey);
    });

    it('should propagate KMS errors during rotation', async () => {
      const mockClient = createMockKmsClient({
        generateDataKey: () => { throw new Error('KMS service unavailable'); },
      });
      setKmsClient(mockClient);

      await expect(rotateDataKey(TEST_KMS_ARN)).rejects.toThrow(EncryptionError);
    });
  });
});
