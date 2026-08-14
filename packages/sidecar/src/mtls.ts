import { readFileSync, watchFile, unwatchFile, statSync } from 'fs';
import { X509Certificate } from 'crypto';
import type { ConnectionOptions } from 'tls';

export interface TlsConfig {
  cert: Buffer;
  key: Buffer;
  ca: Buffer;
  rejectUnauthorized: true;
}

export interface TlsPaths {
  certPath: string;
  keyPath: string;
  caPath: string;
}

const DEFAULT_PATHS: TlsPaths = {
  certPath: '/etc/duster/tls/tenant.crt',
  keyPath: '/etc/duster/tls/tenant.key',
  caPath: '/etc/duster/tls/ca.crt',
};

/**
 * Load TLS configuration from disk.
 * Reads tenant certificate, private key, and CA certificate.
 */
export function loadTlsConfig(paths: Partial<TlsPaths> = {}): TlsConfig {
  const resolved: TlsPaths = {
    certPath: paths.certPath ?? DEFAULT_PATHS.certPath,
    keyPath: paths.keyPath ?? DEFAULT_PATHS.keyPath,
    caPath: paths.caPath ?? DEFAULT_PATHS.caPath,
  };

  let cert: Buffer;
  let key: Buffer;
  let ca: Buffer;

  try {
    cert = readFileSync(resolved.certPath);
  } catch (err: any) {
    throw new Error(
      `Failed to read tenant certificate at ${resolved.certPath}: ${err.message}`,
    );
  }

  try {
    key = readFileSync(resolved.keyPath);
  } catch (err: any) {
    throw new Error(
      `Failed to read tenant private key at ${resolved.keyPath}: ${err.message}`,
    );
  }

  try {
    ca = readFileSync(resolved.caPath);
  } catch (err: any) {
    throw new Error(
      `Failed to read CA certificate at ${resolved.caPath}: ${err.message}`,
    );
  }

  return { cert, key, ca, rejectUnauthorized: true };
}

/**
 * Create WebSocket connection options with mTLS credentials.
 * Returns an object suitable for passing to the `ws` WebSocket constructor.
 */
export function createSecureWebSocketOptions(
  paths: Partial<TlsPaths> = {},
): ConnectionOptions {
  const config = loadTlsConfig(paths);
  return {
    cert: config.cert,
    key: config.key,
    ca: config.ca,
    rejectUnauthorized: config.rejectUnauthorized,
  };
}

/**
 * Get the expiry date of the tenant certificate.
 * Returns the Date when the certificate expires.
 * Throws if the certificate cannot be parsed.
 */
export function getCertificateExpiry(certPath?: string): Date {
  const resolvedPath = certPath ?? DEFAULT_PATHS.certPath;

  let certPem: string;
  try {
    certPem = readFileSync(resolvedPath, 'utf-8');
  } catch (err: any) {
    throw new Error(
      `Failed to read certificate at ${resolvedPath}: ${err.message}`,
    );
  }

  const x509 = new X509Certificate(certPem);
  return new Date(x509.validTo);
}

/**
 * Check if the tenant certificate will expire within a given number of days.
 * Defaults to warning at 7 days before expiry.
 */
export function isCertificateExpiringSoon(
  certPath?: string,
  warningDays: number = 7,
): { expiring: boolean; expiresAt: Date; daysRemaining: number } {
  const expiresAt = getCertificateExpiry(certPath);
  const now = new Date();
  const msRemaining = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  const expiring = daysRemaining <= warningDays;

  return { expiring, expiresAt, daysRemaining };
}

export type CertRotationCallback = (newConfig: TlsConfig) => void;

export interface CertWatcher {
  stop: () => void;
}

/**
 * Watch certificate files for changes and invoke the callback with
 * the reloaded TLS config when rotation occurs.
 *
 * Uses fs.watchFile (polling) for reliability on network filesystems.
 * Poll interval defaults to 60 seconds.
 */
export function watchCertificateRotation(
  callback: CertRotationCallback,
  paths: Partial<TlsPaths> = {},
  pollIntervalMs: number = 60_000,
): CertWatcher {
  const resolved: TlsPaths = {
    certPath: paths.certPath ?? DEFAULT_PATHS.certPath,
    keyPath: paths.keyPath ?? DEFAULT_PATHS.keyPath,
    caPath: paths.caPath ?? DEFAULT_PATHS.caPath,
  };

  let lastModifiedCert = getModTime(resolved.certPath);
  let lastModifiedKey = getModTime(resolved.keyPath);
  let lastModifiedCa = getModTime(resolved.caPath);

  const onFileChange = () => {
    const currentCert = getModTime(resolved.certPath);
    const currentKey = getModTime(resolved.keyPath);
    const currentCa = getModTime(resolved.caPath);

    const changed =
      currentCert !== lastModifiedCert ||
      currentKey !== lastModifiedKey ||
      currentCa !== lastModifiedCa;

    if (changed) {
      lastModifiedCert = currentCert;
      lastModifiedKey = currentKey;
      lastModifiedCa = currentCa;

      try {
        const newConfig = loadTlsConfig(resolved);
        callback(newConfig);
      } catch {
        // Certificate files may be mid-rotation; retry on next poll
      }
    }
  };

  const watchOpts = { persistent: false, interval: pollIntervalMs };
  watchFile(resolved.certPath, watchOpts, onFileChange);
  watchFile(resolved.keyPath, watchOpts, onFileChange);
  watchFile(resolved.caPath, watchOpts, onFileChange);

  return {
    stop: () => {
      unwatchFile(resolved.certPath, onFileChange);
      unwatchFile(resolved.keyPath, onFileChange);
      unwatchFile(resolved.caPath, onFileChange);
    },
  };
}

function getModTime(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}
