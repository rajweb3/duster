import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { TenantMessage, DashboardMessage } from '@duster/shared';
import { validateDashboardMessage } from '@duster/shared';
import { EventBuffer } from './event-buffer.js';
import type { SidecarConfig } from './config.js';
import { createSecureWebSocketOptions } from './mtls.js';

export type ConnectorState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export class DashboardConnector extends EventEmitter {
  private ws: WebSocket | null = null;
  private state: ConnectorState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly buffer: EventBuffer;
  private readonly config: SidecarConfig;
  private jwtToken: string = '';
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: SidecarConfig) {
    super();
    this.config = config;
    this.buffer = new EventBuffer(config.maxBufferedEvents, config.maxBufferSizeBytes);
  }

  getState(): ConnectorState {
    return this.state;
  }

  getBufferLength(): number {
    return this.buffer.length;
  }

  setToken(token: string): void {
    this.jwtToken = token;
  }

  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') return;

    this.setState('connecting');
    const url = `${this.config.dashboardUrl}/ws?tenantId=${this.config.tenantId}`;

    const wsOptions: WebSocket.ClientOptions = {
      headers: {
        authorization: `Bearer ${this.jwtToken}`,
        'x-tenant-id': this.config.tenantId,
      },
    };

    if (this.config.useMtls) {
      const tlsOptions = createSecureWebSocketOptions({
        certPath: this.config.tlsCertPath,
        keyPath: this.config.tlsKeyPath,
        caPath: this.config.tlsCaPath,
      });
      Object.assign(wsOptions, tlsOptions);
    }

    this.ws = new WebSocket(url, wsOptions);

    this.ws.on('open', () => {
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.flushBuffer();
      this.startPing();
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleIncoming(data.toString());
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.cleanup();
      if (code !== 1000) {
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
      }
      this.emit('disconnected', { code, reason: reason.toString() });
    });

    this.ws.on('error', (err: Error) => {
      this.emit('error', err);
      this.cleanup();
      this.scheduleReconnect();
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
    this.setState('disconnected');
  }

  send(message: TenantMessage): boolean {
    if (this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return this.buffer.push(message);
  }

  private handleIncoming(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.emit('error', new Error(`Invalid JSON from dashboard: ${raw.slice(0, 100)}`));
      return;
    }

    const result = validateDashboardMessage(parsed);
    if (!result.success) {
      this.emit('error', new Error(`Invalid dashboard message: ${result.error}`));
      return;
    }

    this.emit('message', result.data);
  }

  private flushBuffer(): void {
    const buffered = this.buffer.drain();
    for (const msg of buffered) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
    }
    if (buffered.length > 0) {
      this.emit('buffer_flushed', buffered.length);
    }
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting');
    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnectBaseMs * Math.pow(2, this.reconnectAttempts - 1),
      this.config.reconnectMaxMs,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);

    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000);
      }
      this.ws = null;
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 15000);
  }

  private setState(state: ConnectorState): void {
    const prev = this.state;
    this.state = state;
    if (prev !== state) {
      this.emit('state_change', { from: prev, to: state });
    }
  }
}
