import { randomBytes, X509Certificate, createPrivateKey } from 'crypto';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface TenantCertBundle {
  certificate: string;
  privateKey: string;
  caCertificate: string;
  serialNumber: string;
  tenantId: string;
  expiresAt: Date;
  issuedAt: Date;
}

export interface CertificateMetadata {
  serialNumber: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  fingerprint256: string;
  tenantId: string | null;
  isExpired: boolean;
  daysRemaining: number;
}

export interface UserDataCertSection {
  script: string;
}

/**
 * Generate a complete tenant certificate bundle during provisioning.
 * Creates a new RSA key pair, generates a CSR, and signs it with the Duster CA.
 *
 * @param tenantId - The tenant UUID
 * @param caKeyPem - CA private key in PEM format
 * @param caCertPem - CA certificate in PEM format
 * @param validityDays - Certificate validity in days (default: 365)
 */
export function generateTenantCertBundle(
  tenantId: string,
  caKeyPem: string,
  caCertPem: string,
  validityDays: number = 365,
): TenantCertBundle {
  // Validate inputs
  if (!tenantId || tenantId.trim().length === 0) {
    throw new Error('tenantId is required');
  }

  try {
    createPrivateKey(caKeyPem);
  } catch (err: any) {
    throw new Error(`Invalid CA private key: ${err.message}`);
  }

  try {
    new X509Certificate(caCertPem);
  } catch (err: any) {
    throw new Error(`Invalid CA certificate: ${err.message}`);
  }

  const serialNumber = randomBytes(16).toString('hex');
  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + validityDays * 24 * 60 * 60 * 1000,
  );

  const workDir = join(
    tmpdir(),
    `duster-provision-cert-${Date.now()}-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(workDir, { recursive: true });

  try {
    const caKeyPath = join(workDir, 'ca.key');
    const caCertPath = join(workDir, 'ca.crt');
    const tenantKeyPath = join(workDir, 'tenant.key');
    const tenantCsrPath = join(workDir, 'tenant.csr');
    const tenantCertPath = join(workDir, 'tenant.crt');
    const extPath = join(workDir, 'ext.cnf');

    // Write CA credentials to temp files
    writeFileSync(caKeyPath, caKeyPem, { mode: 0o600 });
    writeFileSync(caCertPath, caCertPem);

    // Generate tenant RSA key pair (2048-bit)
    execSync(`openssl genrsa -out "${tenantKeyPath}" 2048 2>/dev/null`, {
      stdio: 'pipe',
    });

    // Generate CSR with tenant CN
    execSync(
      `openssl req -new -key "${tenantKeyPath}" -out "${tenantCsrPath}" ` +
        `-subj "/CN=tenant-${tenantId}/O=Duster/OU=Tenants"`,
      { stdio: 'pipe' },
    );

    // Write X.509v3 extensions for client authentication
    writeFileSync(
      extPath,
      [
        'basicConstraints=critical,CA:FALSE',
        'keyUsage=critical,digitalSignature,keyEncipherment',
        'extendedKeyUsage=clientAuth',
        `subjectAltName=URI:urn:duster:tenant:${tenantId}`,
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
      caCertificate: caCertPem,
      serialNumber,
      tenantId,
      expiresAt,
      issuedAt,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Extract metadata from a PEM-encoded certificate.
 */
export function getCertificateMetadata(certPem: string): CertificateMetadata {
  const x509 = new X509Certificate(certPem);
  const now = new Date();
  const validTo = new Date(x509.validTo);
  const validFrom = new Date(x509.validFrom);

  const msRemaining = validTo.getTime() - now.getTime();
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  const isExpired = now > validTo;

  // Extract tenant ID from CN
  const cnMatch = x509.subject.match(/CN=tenant-([^\n]+)/);
  const tenantId = cnMatch ? cnMatch[1].trim() : null;

  return {
    serialNumber: x509.serialNumber,
    subject: x509.subject,
    issuer: x509.issuer,
    validFrom,
    validTo,
    fingerprint256: x509.fingerprint256,
    tenantId,
    isExpired,
    daysRemaining,
  };
}

/**
 * Generate a user-data script section that writes TLS certificates to disk.
 * This is injected into the VM's cloud-init user-data during provisioning.
 */
export function generateCertUserDataScript(bundle: TenantCertBundle): UserDataCertSection {
  const script = `
# --- TLS Certificate Provisioning ---
mkdir -p /etc/duster/tls
chmod 700 /etc/duster/tls

cat > /etc/duster/tls/tenant.crt <<'CERTEOF'
${bundle.certificate.trim()}
CERTEOF
chmod 644 /etc/duster/tls/tenant.crt

cat > /etc/duster/tls/tenant.key <<'KEYEOF'
${bundle.privateKey.trim()}
KEYEOF
chmod 600 /etc/duster/tls/tenant.key

cat > /etc/duster/tls/ca.crt <<'CAEOF'
${bundle.caCertificate.trim()}
CAEOF
chmod 644 /etc/duster/tls/ca.crt

# Set ownership to duster service user
chown -R duster:duster /etc/duster/tls

# Write cert metadata for the sidecar
cat > /etc/duster/tls/metadata.json <<'METAEOF'
${JSON.stringify(
  {
    serialNumber: bundle.serialNumber,
    tenantId: bundle.tenantId,
    issuedAt: bundle.issuedAt.toISOString(),
    expiresAt: bundle.expiresAt.toISOString(),
  },
  null,
  2,
)}
METAEOF
chmod 644 /etc/duster/tls/metadata.json

echo "DUSTER_TLS_PROVISIONED=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /etc/duster/boot-status
# --- End TLS Certificate Provisioning ---
`;

  return { script: script.trim() };
}

/**
 * Generate a fresh Duster CA certificate + key pair.
 * Used for initial platform setup or CA rotation.
 */
export function generateDusterCA(
  validityDays: number = 3650,
): { certificate: string; privateKey: string } {
  const workDir = join(
    tmpdir(),
    `duster-ca-gen-${Date.now()}-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(workDir, { recursive: true });

  try {
    const keyPath = join(workDir, 'ca.key');
    const certPath = join(workDir, 'ca.crt');
    const extPath = join(workDir, 'ext.cnf');

    // 4096-bit RSA for CA
    execSync(`openssl genrsa -out "${keyPath}" 4096 2>/dev/null`, {
      stdio: 'pipe',
    });

    writeFileSync(
      extPath,
      [
        'basicConstraints=critical,CA:TRUE,pathlen:0',
        'keyUsage=critical,keyCertSign,cRLSign',
        'subjectKeyIdentifier=hash',
        'authorityKeyIdentifier=keyid:always,issuer',
      ].join('\n') + '\n',
    );

    execSync(
      `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" ` +
        `-days ${validityDays} -subj "/CN=Duster CA/O=Duster/OU=Platform" ` +
        `-extensions v3_ca -extfile "${extPath}"`,
      { stdio: 'pipe' },
    );

    const certificate = readFileSync(certPath, 'utf-8');
    const privateKey = readFileSync(keyPath, 'utf-8');

    return { certificate, privateKey };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
