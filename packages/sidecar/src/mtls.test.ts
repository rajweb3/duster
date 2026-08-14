import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateKeyPairSync, createSign, X509Certificate } from 'crypto';
import {
  loadTlsConfig,
  createSecureWebSocketOptions,
  getCertificateExpiry,
  isCertificateExpiringSoon,
  watchCertificateRotation,
} from './mtls.js';

function generateSelfSignedCert(opts: {
  cn: string;
  days: number;
}): { cert: string; key: string } {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const { execSync } = require('child_process');
  const certDir = join(tmpdir(), `duster-test-cert-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(certDir, { recursive: true });

  const keyPath = join(certDir, 'key.pem');
  const certPath = join(certDir, 'cert.pem');

  writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));

  execSync(
    `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days ${opts.days} -subj "/CN=${opts.cn}"`,
    { stdio: 'pipe' },
  );

  const cert = require('fs').readFileSync(certPath, 'utf-8');
  const key = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  rmSync(certDir, { recursive: true, force: true });

  return { cert, key };
}

describe('mTLS - Sidecar', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `duster-mtls-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('loadTlsConfig', () => {
    it('loads cert, key, and CA from specified paths', () => {
      const { cert: caCert, key: caKey } = generateSelfSignedCert({ cn: 'Duster CA', days: 365 });
      const { cert: tenantCert, key: tenantKey } = generateSelfSignedCert({ cn: 'tenant-abc123', days: 365 });

      const certPath = join(testDir, 'tenant.crt');
      const keyPath = join(testDir, 'tenant.key');
      const caPath = join(testDir, 'ca.crt');

      writeFileSync(certPath, tenantCert);
      writeFileSync(keyPath, tenantKey);
      writeFileSync(caPath, caCert);

      const config = loadTlsConfig({ certPath, keyPath, caPath });

      expect(config.cert).toBeInstanceOf(Buffer);
      expect(config.key).toBeInstanceOf(Buffer);
      expect(config.ca).toBeInstanceOf(Buffer);
      expect(config.rejectUnauthorized).toBe(true);
      expect(config.cert.toString()).toContain('BEGIN CERTIFICATE');
      expect(config.key.toString()).toContain('BEGIN PRIVATE KEY');
    });

    it('throws when certificate file is missing', () => {
      expect(() =>
        loadTlsConfig({
          certPath: '/nonexistent/path/cert.pem',
          keyPath: '/nonexistent/path/key.pem',
          caPath: '/nonexistent/path/ca.pem',
        }),
      ).toThrow('Failed to read tenant certificate');
    });

    it('throws when private key file is missing', () => {
      const { cert } = generateSelfSignedCert({ cn: 'test', days: 30 });
      const certPath = join(testDir, 'tenant.crt');
      writeFileSync(certPath, cert);

      expect(() =>
        loadTlsConfig({
          certPath,
          keyPath: '/nonexistent/key.pem',
          caPath: '/nonexistent/ca.pem',
        }),
      ).toThrow('Failed to read tenant private key');
    });

    it('throws when CA certificate file is missing', () => {
      const { cert, key } = generateSelfSignedCert({ cn: 'test', days: 30 });
      const certPath = join(testDir, 'tenant.crt');
      const keyPath = join(testDir, 'tenant.key');
      writeFileSync(certPath, cert);
      writeFileSync(keyPath, key);

      expect(() =>
        loadTlsConfig({
          certPath,
          keyPath,
          caPath: '/nonexistent/ca.pem',
        }),
      ).toThrow('Failed to read CA certificate');
    });
  });

  describe('createSecureWebSocketOptions', () => {
    it('returns TLS options suitable for WebSocket constructor', () => {
      const { cert: caCert } = generateSelfSignedCert({ cn: 'Duster CA', days: 365 });
      const { cert: tenantCert, key: tenantKey } = generateSelfSignedCert({ cn: 'tenant-abc', days: 365 });

      const certPath = join(testDir, 'tenant.crt');
      const keyPath = join(testDir, 'tenant.key');
      const caPath = join(testDir, 'ca.crt');

      writeFileSync(certPath, tenantCert);
      writeFileSync(keyPath, tenantKey);
      writeFileSync(caPath, caCert);

      const opts = createSecureWebSocketOptions({ certPath, keyPath, caPath });

      expect(opts).toHaveProperty('cert');
      expect(opts).toHaveProperty('key');
      expect(opts).toHaveProperty('ca');
      expect(opts.rejectUnauthorized).toBe(true);
    });
  });

  describe('getCertificateExpiry', () => {
    it('returns the certificate expiry date', () => {
      const { cert } = generateSelfSignedCert({ cn: 'tenant-test', days: 90 });
      const certPath = join(testDir, 'tenant.crt');
      writeFileSync(certPath, cert);

      const expiry = getCertificateExpiry(certPath);

      expect(expiry).toBeInstanceOf(Date);
      // Should be roughly 90 days from now (within a day tolerance)
      const expectedMs = Date.now() + 90 * 24 * 60 * 60 * 1000;
      const diffMs = Math.abs(expiry.getTime() - expectedMs);
      expect(diffMs).toBeLessThan(2 * 24 * 60 * 60 * 1000); // within 2 days
    });

    it('throws when certificate file does not exist', () => {
      expect(() => getCertificateExpiry('/nonexistent/cert.pem')).toThrow(
        'Failed to read certificate',
      );
    });
  });

  describe('isCertificateExpiringSoon', () => {
    it('returns expiring=false for certificate valid 90 days', () => {
      const { cert } = generateSelfSignedCert({ cn: 'tenant-valid', days: 90 });
      const certPath = join(testDir, 'tenant.crt');
      writeFileSync(certPath, cert);

      const result = isCertificateExpiringSoon(certPath, 7);

      expect(result.expiring).toBe(false);
      expect(result.daysRemaining).toBeGreaterThan(80);
    });

    it('returns expiring=true for certificate valid only 3 days', () => {
      const { cert } = generateSelfSignedCert({ cn: 'tenant-expiring', days: 3 });
      const certPath = join(testDir, 'tenant.crt');
      writeFileSync(certPath, cert);

      const result = isCertificateExpiringSoon(certPath, 7);

      expect(result.expiring).toBe(true);
      expect(result.daysRemaining).toBeLessThanOrEqual(7);
    });
  });

  describe('watchCertificateRotation', () => {
    it('returns a watcher with a stop method', () => {
      const { cert, key } = generateSelfSignedCert({ cn: 'tenant-watch', days: 90 });

      const certPath = join(testDir, 'tenant.crt');
      const keyPath = join(testDir, 'tenant.key');
      const caPath = join(testDir, 'ca.crt');

      writeFileSync(certPath, cert);
      writeFileSync(keyPath, key);
      writeFileSync(caPath, cert); // use same cert as CA for test

      const callback = vi.fn();
      const watcher = watchCertificateRotation(callback, { certPath, keyPath, caPath }, 100);

      expect(watcher).toHaveProperty('stop');
      expect(typeof watcher.stop).toBe('function');

      watcher.stop();
    });
  });
});
