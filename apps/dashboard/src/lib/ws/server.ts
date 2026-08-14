import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import {
  validateTenantMessage,
  type TenantMessage,
  type DashboardMessage,
  type CommandMessage,
  type ConfigSyncRequest,
} from '@duster/shared';
import { TenantStore } from './tenant-store.js';
import { extractToken, extractTenantId, verifyToken } from './auth.js';

export interface DashboardWsServerOptions {
  server: Server;
  jwtSecret: string;
  path?: string;
  heartbeatTimeout?: number;
}

export class DashboardWsServer {
  private wss: WebSocketServer;
  private store: TenantStore;
  private readonly jwtSecret: string;
  private staleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatTimeout: number;

  constructor(options: DashboardWsServerOptions) {
    this.jwtSecret = options.jwtSecret;
    this.heartbeatTimeout = options.heartbeatTimeout || 90000;
    this.store = new TenantStore();

    this.wss = new WebSocketServer({
      server: options.server,
      path: options.path || '/ws',
      verifyClient: (info, cb) => this.authenticate(info, cb),
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.staleCheckInterval = setInterval(() => this.checkStaleConnections(), 30000);
  }

  getStore(): TenantStore {
    return this.store;
  }

  sendCommand(tenantId: string, command: CommandMessage): boolean {
    const conn = this.store.get(tenantId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
    conn.ws.send(JSON.stringify(command));
    return true;
  }

  requestConfigSync(tenantId: string): boolean {
    const conn = this.store.get(tenantId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
    const msg: ConfigSyncRequest = { type: 'config.sync.request', tenantId };
    conn.ws.send(JSON.stringify(msg));
    return true;
  }

  broadcastToAll(message: DashboardMessage): void {
    const payload = JSON.stringify(message);
    for (const conn of this.store.getConnected()) {
      conn.ws.send(payload);
    }
  }

  close(): void {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
    this.wss.close();
  }

  private authenticate(
    info: { origin: string; secure: boolean; req: IncomingMessage },
    cb: (res: boolean, code?: number, message?: string) => void,
  ): void {
    const token = extractToken(info.req);
    const tenantId = extractTenantId(info.req);

    if (!token || !tenantId) {
      cb(false, 401, 'Missing authentication');
      return;
    }

    verifyToken(token, this.jwtSecret).then(decoded => {
      if (!decoded || decoded.tenantId !== tenantId) {
        cb(false, 403, 'Invalid token');
        return;
      }
      cb(true);
    }).catch(() => {
      cb(false, 403, 'Invalid token');
    });
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const tenantId = extractTenantId(req)!;
    this.store.add(tenantId, ws);

    ws.on('message', (data) => {
      this.handleMessage(tenantId, data.toString());
    });

    ws.on('close', () => {
      this.store.remove(tenantId);
    });

    ws.on('error', () => {
      this.store.remove(tenantId);
    });

    this.requestConfigSync(tenantId);
  }

  private handleMessage(tenantId: string, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const result = validateTenantMessage(parsed);
    if (!result.success) return;

    const message = result.data;

    if (message.type === 'heartbeat') {
      this.store.updateHeartbeat(tenantId, message.status);
    } else if (message.type === 'config.sync.response') {
      this.store.updateState(tenantId, message);
    }
  }

  private checkStaleConnections(): void {
    const stale = this.store.getStale(this.heartbeatTimeout);
    for (const conn of stale) {
      conn.ws.close(4000, 'Heartbeat timeout');
      this.store.remove(conn.tenantId);
    }
  }
}
