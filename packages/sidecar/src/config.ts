export interface SidecarConfig {
  tenantId: string;
  dashboardUrl: string;
  jwtTokenPath: string;
  hermesApiUrl: string;
  heartbeatIntervalMs: number;
  metricsIntervalMs: number;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  maxBufferedEvents: number;
  maxBufferSizeBytes: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): SidecarConfig {
  const tenantId = env.DUSTER_TENANT_ID;
  if (!tenantId) throw new Error('DUSTER_TENANT_ID is required');

  const dashboardUrl = env.DUSTER_DASHBOARD_URL;
  if (!dashboardUrl) throw new Error('DUSTER_DASHBOARD_URL is required');

  return {
    tenantId,
    dashboardUrl,
    jwtTokenPath: env.DUSTER_JWT_PATH || '/etc/duster/token.jwt',
    hermesApiUrl: env.DUSTER_HERMES_URL || 'http://127.0.0.1:8080',
    heartbeatIntervalMs: parseInt(env.DUSTER_HEARTBEAT_MS || '30000', 10),
    metricsIntervalMs: parseInt(env.DUSTER_METRICS_MS || '10000', 10),
    reconnectBaseMs: parseInt(env.DUSTER_RECONNECT_BASE_MS || '1000', 10),
    reconnectMaxMs: parseInt(env.DUSTER_RECONNECT_MAX_MS || '60000', 10),
    maxBufferedEvents: parseInt(env.DUSTER_MAX_BUFFER_EVENTS || '1000', 10),
    maxBufferSizeBytes: parseInt(env.DUSTER_MAX_BUFFER_BYTES || '10485760', 10),
  };
}
