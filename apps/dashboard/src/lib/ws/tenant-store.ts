import WebSocket from 'ws';
import type { TenantStatus, ConfigSyncResponse } from '@duster/shared';

export interface TenantConnection {
  tenantId: string;
  ws: WebSocket;
  connectedAt: number;
  lastHeartbeat: number;
  status: TenantStatus;
  lastState: ConfigSyncResponse | null;
}

export class TenantStore {
  private connections = new Map<string, TenantConnection>();

  add(tenantId: string, ws: WebSocket): TenantConnection {
    const existing = this.connections.get(tenantId);
    if (existing && existing.ws.readyState === WebSocket.OPEN) {
      existing.ws.close(1000, 'replaced');
    }

    const conn: TenantConnection = {
      tenantId,
      ws,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'healthy',
      lastState: null,
    };
    this.connections.set(tenantId, conn);
    return conn;
  }

  remove(tenantId: string): boolean {
    return this.connections.delete(tenantId);
  }

  get(tenantId: string): TenantConnection | undefined {
    return this.connections.get(tenantId);
  }

  updateHeartbeat(tenantId: string, status: TenantStatus): void {
    const conn = this.connections.get(tenantId);
    if (conn) {
      conn.lastHeartbeat = Date.now();
      conn.status = status;
    }
  }

  updateState(tenantId: string, state: ConfigSyncResponse): void {
    const conn = this.connections.get(tenantId);
    if (conn) {
      conn.lastState = state;
    }
  }

  getAll(): TenantConnection[] {
    return Array.from(this.connections.values());
  }

  getConnected(): TenantConnection[] {
    return this.getAll().filter(c => c.ws.readyState === WebSocket.OPEN);
  }

  getStale(thresholdMs: number): TenantConnection[] {
    const cutoff = Date.now() - thresholdMs;
    return this.getAll().filter(c => c.lastHeartbeat < cutoff);
  }

  size(): number {
    return this.connections.size;
  }

  has(tenantId: string): boolean {
    return this.connections.has(tenantId);
  }
}
