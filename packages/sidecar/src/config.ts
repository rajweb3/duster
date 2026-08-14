export interface SidecarConfig {
  tenantId: string;
  dashboardUrl: string;
  jwtTokenPath: string;
  hermesApiUrl: string;
  heartbeatIntervalMs: number;
  metricsIntervalMs: number;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  maxReconnectAttempts: number;
  dormantRetryMs: number;
  maxBufferedEvents: number;
  maxBufferSizeBytes: number;
  useMtls: boolean;
  tlsCertPath: string;
  tlsKeyPath: string;
  tlsCaPath: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): SidecarConfig {
  const tenantId = env.DUSTER_TENANT_ID;
  if (!tenantId) throw new Error('DUSTER_TENANT_ID is required');

  const dashboardUrl = env.DUSTER_DASHBOARD_URL;
  if (!dashboardUrl) throw new Error('DUSTER_DASHBOARD_URL is required');

  const nodeEnv = env.NODE_ENV || 'production';
  const useMtls = env.DUSTER_USE_MTLS !== undefined
    ? env.DUSTER_USE_MTLS === 'true'
    : nodeEnv === 'production';

  return {
    tenantId,
    dashboardUrl,
    jwtTokenPath: env.DUSTER_JWT_PATH || '/etc/duster/token.jwt',
    hermesApiUrl: env.DUSTER_HERMES_URL || 'http://127.0.0.1:8080',
    heartbeatIntervalMs: parseInt(env.DUSTER_HEARTBEAT_MS || '30000', 10),
    metricsIntervalMs: parseInt(env.DUSTER_METRICS_MS || '10000', 10),
    reconnectBaseMs: parseInt(env.DUSTER_RECONNECT_BASE_MS || '1000', 10),
    reconnectMaxMs: parseInt(env.DUSTER_RECONNECT_MAX_MS || '60000', 10),
    maxReconnectAttempts: parseInt(env.DUSTER_MAX_RECONNECT_ATTEMPTS || '20', 10),
    dormantRetryMs: parseInt(env.DUSTER_DORMANT_RETRY_MS || '300000', 10),
    maxBufferedEvents: parseInt(env.DUSTER_MAX_BUFFER_EVENTS || '1000', 10),
    maxBufferSizeBytes: parseInt(env.DUSTER_MAX_BUFFER_BYTES || '10485760', 10),
    useMtls,
    tlsCertPath: env.DUSTER_TLS_CERT_PATH || '/etc/duster/tls/tenant.crt',
    tlsKeyPath: env.DUSTER_TLS_KEY_PATH || '/etc/duster/tls/tenant.key',
    tlsCaPath: env.DUSTER_TLS_CA_PATH || '/etc/duster/tls/ca.crt',
  };
}
