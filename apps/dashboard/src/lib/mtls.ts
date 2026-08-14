import {
  generateKeyPairSync,
  X509Certificate,
  randomBytes,
  createPrivateKey,
  type KeyObject,
} from 'crypto';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
}

export interface TenantCertBundle {
  certificate: string;
  privateKey: string;
  serialNumber: string;
  tenantId: string;
  expiresAt: Date;
}

export interface CrlEntry {
  serialNumber: string;
  tenantId: string;
  revokedAt: Date;
  reason: string;
}

// In-memory CRL cache, backed by database for persistence.
// On startup, loadRevocationListFromDb() should be called to hydrate.
const revocationList: Map<string, CrlEntry> = new Map();

// CA state
let caPrivateKeyPem: string | null = null;
let caCertPem: string | null = null;

/**
 * Initialize the CA from file paths.
 */
export function initializeCA(caKeyPath: string, caCertPath: string): void {
  caPrivateKeyPem = readFileSync(caKeyPath, 'utf-8');
  caCertPem = readFileSync(caCertPath, 'utf-8');

  // Validate they parse correctly
  createPrivateKey(caPrivateKeyPem);
  new X509Certificate(caCertPem);
}

/**
 * Initialize the CA from PEM strings directly.
 */
export function initializeCAFromPem(keyPem: string, certPem: string): void {
  // Validate
  createPrivateKey(keyPem);
  new X509Certificate(certPem);

  caPrivateKeyPem = keyPem;
  caCertPem = certPem;
}

/**
 * Reset CA state (for testing).
 */
export function resetCA(): void {
  caPrivateKeyPem = null;
  caCertPem = null;
}

/**
 * Validate an incoming client certificate.
 * Checks: parseable, not expired, not revoked, signed by our CA.
 */
export function validateClientCert(certPem: string): {
  valid: boolean;
  error?: string;
} {
  let x509: X509Certificate;
  try {
    x509 = new X509Certificate(certPem);
  } catch (err: any) {
    return { valid: false, error: `Invalid certificate format: ${err.message}` };
  }

  // Check validity period
  const now = new Date();
  if (now < new Date(x509.validFrom)) {
    return { valid: false, error: 'Certificate is not yet valid' };
  }
  if (now > new Date(x509.validTo)) {
    return { valid: false, error: 'Certificate has expired' };
  }

  // Check revocation
  const serial = x509.serialNumber.toLowerCase();
  if (revocationList.has(serial)) {
    const entry = revocationList.get(serial)!;
    return {
      valid: false,
      error: `Certificate revoked at ${entry.revokedAt.toISOString()}: ${entry.reason}`,
    };
  }

  // Check tenant-ID-based revocation
  const tenantResult = extractTenantFromCert(certPem);
  if (tenantResult.tenantId) {
    for (const entry of revocationList.values()) {
      if (entry.tenantId === tenantResult.tenantId) {
        return {
          valid: false,
          error: `Tenant ${tenantResult.tenantId} certificate revoked: ${entry.reason}`,
        };
      }
    }
  }

  // Verify issuer matches our CA
  if (caCertPem) {
    try {
      const caCert = new X509Certificate(caCertPem);
      if (!x509.checkIssued(caCert)) {
        return { valid: false, error: 'Certificate not issued by trusted CA' };
      }
    } catch {
      return { valid: false, error: 'Failed to verify certificate chain' };
    }
  }

  return { valid: true };
}

/**
 * Extract tenant ID from the certificate's Common Name.
 * Expected CN format: "tenant-{uuid}"
 */
export function extractTenantFromCert(certPem: string): {
  tenantId: string | null;
  error?: string;
} {
  let x509: X509Certificate;
  try {
    x509 = new X509Certificate(certPem);
  } catch (err: any) {
    return { tenantId: null, error: `Invalid certificate: ${err.message}` };
  }

  const subject = x509.subject;
  const cnMatch = subject.match(/CN=([^\n]+)/);

  if (!cnMatch) {
    return { tenantId: null, error: 'No CN found in certificate subject' };
  }

  const cn = cnMatch[1].trim();
  const tenantMatch = cn.match(/^tenant-(.+)$/);

  if (!tenantMatch) {
    return {
      tenantId: null,
      error: `CN "${cn}" does not match expected format "tenant-{id}"`,
    };
  }

  return { tenantId: tenantMatch[1] };
}

/**
 * Generate a tenant certificate signed by the Duster CA.
 * CN is set to "tenant-{tenantId}".
 * Returns the certificate, private key, serial number, and expiry.
 */
export function generateTenantCertificate(
  tenantId: string,
  validityDays: number = 365,
): TenantCertBundle {
  if (!caPrivateKeyPem || !caCertPem) {
    throw new Error(
      'CA not initialized. Call initializeCA() or initializeCAFromPem() first.',
    );
  }

  const serialNumber = randomBytes(16).toString('hex');
  const expiresAt = new Date(
    Date.now() + validityDays * 24 * 60 * 60 * 1000,
  );

  const workDir = join(
    tmpdir(),
    `duster-certgen-${Date.now()}-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(workDir, { recursive: true });

  try {
    const caKeyPath = join(workDir, 'ca.key');
    const caCertPath = join(workDir, 'ca.crt');
    const tenantKeyPath = join(workDir, 'tenant.key');
    const tenantCsrPath = join(workDir, 'tenant.csr');
    const tenantCertPath = join(workDir, 'tenant.crt');
    const extPath = join(workDir, 'ext.cnf');

    writeFileSync(caKeyPath, caPrivateKeyPem, { mode: 0o600 });
    writeFileSync(caCertPath, caCertPem);

    // Generate tenant key pair
    execSync(`openssl genrsa -out "${tenantKeyPath}" 2048 2>/dev/null`, {
      stdio: 'pipe',
    });

    // Generate CSR
    execSync(
      `openssl req -new -key "${tenantKeyPath}" -out "${tenantCsrPath}" ` +
        `-subj "/CN=tenant-${tenantId}/O=Duster"`,
      { stdio: 'pipe' },
    );

    // Extensions for client auth
    writeFileSync(
      extPath,
      [
        'basicConstraints=critical,CA:FALSE',
        'keyUsage=critical,digitalSignature,keyEncipherment',
        'extendedKeyUsage=clientAuth',
      ].join('\n') + '\n',
    );

    // Sign with CA
    execSync(
      `openssl x509 -req -in "${tenantCsrPath}" ` +
        `-CA "${caCertPath}" -CAkey "${caKeyPath}" ` +
        `-out "${tenantCertPath}" -days ${validityDays} ` +
        `-set_serial 0x${serialNumber} -extfile "${extPath}"`,
      { stdio: 'pipe' },
    );

    const certificate = readFileSync(tenantCertPath, 'utf-8');
    const privateKey = readFileSync(tenantKeyPath, 'utf-8');

    return {
      certificate,
      privateKey,
      serialNumber,
      tenantId,
      expiresAt,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Revoke a tenant's certificate. Adds to in-memory CRL and persists to database.
 * Persistence is best-effort — revocation is immediate in-memory regardless.
 */
export async function revokeCertificate(
  tenantId: string,
  reason: string = 'tenant_deprovisioned',
): Promise<{ revoked: boolean; error?: string }> {
  const entry: CrlEntry = {
    serialNumber: `revoked-${tenantId}`,
    tenantId,
    revokedAt: new Date(),
    reason,
  };

  revocationList.set(entry.serialNumber, entry);
  try {
    await persistRevocation(entry);
  } catch {
    // DB persistence is best-effort; in-memory CRL is already updated
  }
  return { revoked: true };
}

/**
 * Revoke a certificate by its serial number directly.
 * Persists to database for crash safety (best-effort).
 */
export async function revokeCertificateBySerial(
  serialNumber: string,
  tenantId: string,
  reason: string = 'key_compromise',
): Promise<{ revoked: boolean }> {
  const entry: CrlEntry = {
    serialNumber: serialNumber.toLowerCase(),
    tenantId,
    revokedAt: new Date(),
    reason,
  };
  revocationList.set(serialNumber.toLowerCase(), entry);
  try {
    await persistRevocation(entry);
  } catch {
    // DB persistence is best-effort; in-memory CRL is already updated
  }
  return { revoked: true };
}

/**
 * Check if a certificate serial is in the revocation list.
 */
export function isCertificateRevoked(serialNumber: string): boolean {
  return revocationList.has(serialNumber.toLowerCase());
}

/**
 * Get the full CRL entries.
 */
export function getRevocationList(): CrlEntry[] {
  return Array.from(revocationList.values());
}

/**
 * Clear the revocation list (testing utility).
 */
export function clearRevocationList(): void {
  revocationList.clear();
}

/**
 * Load all revocation entries from the database into the in-memory cache.
 * Should be called at server startup to ensure CRL survives restarts.
 */
export async function loadRevocationListFromDb(): Promise<number> {
  const { db } = await import('@/db');
  const { certificateRevocations } = await import('@/db/schema');

  const rows = await db.select().from(certificateRevocations);

  revocationList.clear();
  for (const row of rows) {
    const entry: CrlEntry = {
      serialNumber: row.serialNumber,
      tenantId: row.tenantId,
      revokedAt: row.revokedAt,
      reason: row.reason,
    };
    revocationList.set(row.serialNumber.toLowerCase(), entry);
  }

  return rows.length;
}

/**
 * Persist a revocation entry to the database (in addition to in-memory cache).
 */
export async function persistRevocation(entry: CrlEntry): Promise<void> {
  const { db } = await import('@/db');
  const { certificateRevocations } = await import('@/db/schema');

  await db.insert(certificateRevocations).values({
    tenantId: entry.tenantId,
    serialNumber: entry.serialNumber,
    reason: entry.reason,
    revokedAt: entry.revokedAt,
  });
}

/**
 * Generate a self-signed CA certificate + key pair.
 * Useful for bootstrapping the Duster CA.
 */
export function generateCACertificate(
  cn: string = 'Duster CA',
  validityDays: number = 3650,
): { certificate: string; privateKey: string } {
  const workDir = join(
    tmpdir(),
    `duster-ca-${Date.now()}-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(workDir, { recursive: true });

  try {
    const keyPath = join(workDir, 'ca.key');
    const certPath = join(workDir, 'ca.crt');
    const confPath = join(workDir, 'openssl.cnf');

    execSync(`openssl genrsa -out "${keyPath}" 4096 2>/dev/null`, {
      stdio: 'pipe',
    });

    writeFileSync(
      confPath,
      [
        '[req]',
        'distinguished_name = req_dn',
        'x509_extensions = v3_ca',
        'prompt = no',
        '',
        '[req_dn]',
        `CN = ${cn}`,
        'O = Duster',
        '',
        '[v3_ca]',
        'basicConstraints = critical,CA:TRUE',
        'keyUsage = critical,keyCertSign,cRLSign',
        'subjectKeyIdentifier = hash',
      ].join('\n') + '\n',
    );

    execSync(
      `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" ` +
        `-days ${validityDays} -config "${confPath}"`,
      { stdio: 'pipe' },
    );

    const certificate = readFileSync(certPath, 'utf-8');
    const privateKey = readFileSync(keyPath, 'utf-8');

    return { certificate, privateKey };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Parse certificate and return structured metadata.
 */
export function getCertificateInfo(certPem: string): CertificateInfo {
  const x509 = new X509Certificate(certPem);
  return {
    subject: x509.subject,
    issuer: x509.issuer,
    serialNumber: x509.serialNumber,
    validFrom: new Date(x509.validFrom),
    validTo: new Date(x509.validTo),
    fingerprint: x509.fingerprint256,
  };
}
