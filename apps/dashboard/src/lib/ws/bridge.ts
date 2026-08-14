import { WebSocket } from 'ws';

interface TenantConnection {
  ws: WebSocket;
  tenantId: string;
  connectedAt: number;
  lastHeartbeat: number;
}

/**
 * Shared tenant connection registry.
 * The custom server.ts populates this via registerTenantConnection/removeTenantConnection.
 * API routes call sendCommandToTenant to forward commands over WebSocket.
 */
const tenantConnections = new Map<string, TenantConnection>();

export function registerTenantConnection(tenantId: string, ws: WebSocket): void {
  const existing = tenantConnections.get(tenantId);
  if (existing && existing.ws.readyState === WebSocket.OPEN) {
    existing.ws.close(4003, 'Replaced by new connection');
  }
  tenantConnections.set(tenantId, {
    ws,
    tenantId,
    connectedAt: Date.now(),
    lastHeartbeat: Date.now(),
  });
}

export function removeTenantConnection(tenantId: string): void {
  tenantConnections.delete(tenantId);
}

export function updateTenantHeartbeat(tenantId: string): void {
  const conn = tenantConnections.get(tenantId);
  if (conn) {
    conn.lastHeartbeat = Date.now();
  }
}

export function getTenantConnection(tenantId: string): TenantConnection | undefined {
  return tenantConnections.get(tenantId);
}

export function isTenantConnected(tenantId: string): boolean {
  const conn = tenantConnections.get(tenantId);
  return !!conn && conn.ws.readyState === WebSocket.OPEN;
}

export function sendCommandToTenant(tenantId: string, command: unknown): boolean {
  const conn = tenantConnections.get(tenantId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  conn.ws.send(JSON.stringify(command));
  return true;
}

export function getConnectedTenantIds(): string[] {
  const ids: string[] = [];
  for (const [tenantId, conn] of tenantConnections.entries()) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      ids.push(tenantId);
    }
  }
  return ids;
}

export function getStaleConnections(timeoutMs: number): TenantConnection[] {
  const now = Date.now();
  const stale: TenantConnection[] = [];
  for (const conn of tenantConnections.values()) {
    if (now - conn.lastHeartbeat > timeoutMs) {
      stale.push(conn);
    }
  }
  return stale;
}
