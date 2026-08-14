import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  validateClientCert,
  extractTenantFromCert,
  generateTenantCertificate,
  revokeCertificate,
  revokeCertificateBySerial,
  isCertificateRevoked,
  getRevocationList,
  clearRevocationList,
  generateCACertificate,
  initializeCAFromPem,
  resetCA,
  getCertificateInfo,
} from './mtls.js';

describe('mTLS - Dashboard', () => {
  let caCert: string;
  let caKey: string;

  beforeAll(() => {
    const ca = generateCACertificate('Duster Test CA', 365);
    caCert = ca.certificate;
    caKey = ca.privateKey;
  });

  beforeEach(() => {
    clearRevocationList();
    initializeCAFromPem(caKey, caCert);
  });

  afterEach(() => {
    resetCA();
  });

  describe('extractTenantFromCert', () => {
    it('extracts tenant ID from CN with format tenant-{uuid}', () => {
      const bundle = generateTenantCertificate('abc-123-def-456');
      const result = extractTenantFromCert(bundle.certificate);

      expect(result.tenantId).toBe('abc-123-def-456');
      expect(result.error).toBeUndefined();
    });

    it('extracts tenant ID with UUID format', () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const bundle = generateTenantCertificate(tenantId);
      const result = extractTenantFromCert(bundle.certificate);

      expect(result.tenantId).toBe(tenantId);
    });

    it('returns error for certificate without tenant- prefix in CN', () => {
      // Generate a self-signed cert with a non-tenant CN
      const { execSync } = require('child_process');
      const { tmpdir } = require('os');
      const { join } = require('path');
      const { writeFileSync, readFileSync, mkdirSync, rmSync } = require('fs');
      const { generateKeyPairSync } = require('crypto');

      const workDir = join(tmpdir(), `duster-test-${Date.now()}`);
      mkdirSync(workDir, { recursive: true });
      const keyPath = join(workDir, 'key.pem');
      const certPath = join(workDir, 'cert.pem');

      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
      execSync(
        `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 30 -subj "/CN=some-other-thing"`,
        { stdio: 'pipe' },
      );

      const cert = readFileSync(certPath, 'utf-8');
      rmSync(workDir, { recursive: true, force: true });

      const result = extractTenantFromCert(cert);
      expect(result.tenantId).toBeNull();
      expect(result.error).toContain('does not match expected format');
    });

    it('returns error for invalid certificate data', () => {
      const result = extractTenantFromCert('not a cert');
      expect(result.tenantId).toBeNull();
      expect(result.error).toContain('Invalid certificate');
    });
  });

  describe('validateClientCert', () => {
    it('validates a valid tenant certificate', () => {
      const bundle = generateTenantCertificate('valid-tenant-001');
      const result = validateClientCert(bundle.certificate);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns invalid for malformed certificate', () => {
      const result = validateClientCert('garbage data');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid certificate format');
    });

    it('returns invalid for a revoked certificate', async () => {
      const bundle = generateTenantCertificate('revoked-tenant');
      await revokeCertificate('revoked-tenant', 'deprovisioned');

      const result = validateClientCert(bundle.certificate);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('returns invalid for a certificate with revoked serial', async () => {
      const bundle = generateTenantCertificate('serial-revoked-tenant');
      const info = getCertificateInfo(bundle.certificate);
      await revokeCertificateBySerial(info.serialNumber, 'serial-revoked-tenant', 'key_compromise');

      const result = validateClientCert(bundle.certificate);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });
  });

  describe('revokeCertificate', () => {
    it('adds tenant to revocation list', async () => {
      const result = await revokeCertificate('tenant-to-revoke', 'manual_revocation');

      expect(result.revoked).toBe(true);
      const list = getRevocationList();
      expect(list).toHaveLength(1);
      expect(list[0].tenantId).toBe('tenant-to-revoke');
      expect(list[0].reason).toBe('manual_revocation');
    });

    it('uses default reason when none provided', async () => {
      await revokeCertificate('some-tenant');
      const list = getRevocationList();
      expect(list[0].reason).toBe('tenant_deprovisioned');
    });

    it('tracks revocation timestamp', async () => {
      const before = new Date();
      await revokeCertificate('timed-tenant');
      const after = new Date();

      const list = getRevocationList();
      expect(list[0].revokedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(list[0].revokedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('generateTenantCertificate', () => {
    it('generates a valid certificate bundle', () => {
      const bundle = generateTenantCertificate('gen-test-tenant');

      expect(bundle.certificate).toContain('BEGIN CERTIFICATE');
      expect(bundle.privateKey).toContain('BEGIN');
      expect(bundle.serialNumber).toHaveLength(32); // 16 bytes hex
      expect(bundle.tenantId).toBe('gen-test-tenant');
      expect(bundle.expiresAt).toBeInstanceOf(Date);
      expect(bundle.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('sets correct CN in the certificate', () => {
      const bundle = generateTenantCertificate('my-uuid-tenant');
      const result = extractTenantFromCert(bundle.certificate);
      expect(result.tenantId).toBe('my-uuid-tenant');
    });

    it('generates unique serial numbers', () => {
      const bundle1 = generateTenantCertificate('tenant-a');
      const bundle2 = generateTenantCertificate('tenant-b');

      expect(bundle1.serialNumber).not.toBe(bundle2.serialNumber);
    });

    it('respects custom validity duration', () => {
      const bundle = generateTenantCertificate('short-lived', 30);
      const info = getCertificateInfo(bundle.certificate);

      const expectedExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const diff = Math.abs(info.validTo.getTime() - expectedExpiry);
      // Within 2 minutes tolerance for test execution time
      expect(diff).toBeLessThan(2 * 60 * 1000);
    });

    it('throws when CA is not initialized', () => {
      resetCA();
      expect(() => generateTenantCertificate('no-ca-tenant')).toThrow(
        'CA not initialized',
      );
    });
  });

  describe('getCertificateInfo', () => {
    it('parses certificate metadata correctly', () => {
      const bundle = generateTenantCertificate('info-tenant');
      const info = getCertificateInfo(bundle.certificate);

      expect(info.subject).toContain('CN=tenant-info-tenant');
      expect(info.serialNumber).toBeTruthy();
      expect(info.validFrom).toBeInstanceOf(Date);
      expect(info.validTo).toBeInstanceOf(Date);
      expect(info.fingerprint).toBeTruthy();
    });
  });

  describe('CRL management', () => {
    it('clearRevocationList empties the list', async () => {
      await revokeCertificate('t1');
      await revokeCertificate('t2');
      expect(getRevocationList()).toHaveLength(2);

      clearRevocationList();
      expect(getRevocationList()).toHaveLength(0);
    });

    it('isCertificateRevoked checks by serial', async () => {
      await revokeCertificateBySerial('AABB0011', 'some-tenant');
      expect(isCertificateRevoked('aabb0011')).toBe(true);
      expect(isCertificateRevoked('other')).toBe(false);
    });
  });
});
