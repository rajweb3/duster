import { readFile } from 'fs/promises';
import type {
  HeartbeatMessage,
  MetricsMessage,
  DashboardMessage,
  CommandAckMessage,
  ConfigSyncResponse,
} from '@duster/shared';
import type { SidecarConfig } from './config.js';
import { DashboardConnector } from './connector.js';
import { HermesClient } from './hermes-client.js';
import { HealthMonitor } from './health.js';

export class Sidecar {
  private readonly config: SidecarConfig;
  private readonly connector: DashboardConnector;
  private readonly hermes: HermesClient;
  private readonly health: HealthMonitor;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private startedAt: number = 0;

  constructor(config: SidecarConfig) {
    this.config = config;
    this.connector = new DashboardConnector(config);
    this.hermes = new HermesClient(config.hermesApiUrl);
    this.health = new HealthMonitor(this.hermes);

    this.connector.on('message', (msg: DashboardMessage) => this.handleDashboardMessage(msg));
    this.connector.on('connected', () => this.onConnected());
    this.connector.on('error', (err: Error) => this.onError(err));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();

    const token = await this.loadToken();
    this.connector.setToken(token);

    this.health.start();
    this.connector.connect();

    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.config.heartbeatIntervalMs);
    this.metricsTimer = setInterval(() => this.sendMetrics(), this.config.metricsIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    this.health.stop();
    this.connector.disconnect();
  }

  getConnector(): DashboardConnector {
    return this.connector;
  }

  getHealthMonitor(): HealthMonitor {
    return this.health;
  }

  private async loadToken(): Promise<string> {
    try {
      return (await readFile(this.config.jwtTokenPath, 'utf-8')).trim();
    } catch {
      throw new Error(`Failed to read JWT token from ${this.config.jwtTokenPath}`);
    }
  }

  private sendHeartbeat(): void {
    const state = this.health.getState();
    const message: HeartbeatMessage = {
      type: 'heartbeat',
      tenantId: this.config.tenantId,
      timestamp: Date.now(),
      status: state.status,
      model: {
        loaded: state.modelLoaded,
        name: state.modelName,
        inferenceSpeed: state.inferenceSpeed,
      },
      agent: {
        activeSessions: state.activeSessions,
        queueDepth: state.queueDepth,
      },
      system: {
        cpuPercent: state.cpuPercent,
        memoryUsedMB: state.memoryUsedMB,
        diskUsedPercent: state.diskUsedPercent,
      },
    };
    this.connector.send(message);
  }

  private sendMetrics(): void {
    const state = this.health.getState();
    const message: MetricsMessage = {
      type: 'metrics',
      tenantId: this.config.tenantId,
      timestamp: Date.now(),
      tokensPerMinute: 0,
      activeSessions: state.activeSessions,
      queueDepth: state.queueDepth,
      inferenceSpeedTokS: state.inferenceSpeed,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      errorRate: state.consecutiveFailures > 0 ? 1 : 0,
    };
    this.connector.send(message);
  }

  private async handleDashboardMessage(msg: DashboardMessage): Promise<void> {
    if (msg.type === 'command') {
      const result = await this.hermes.executeCommand(msg.action, msg.payload as Record<string, unknown>);
      const ack: CommandAckMessage = {
        type: 'command.ack',
        commandId: msg.commandId,
        tenantId: this.config.tenantId,
        success: result.success,
        error: result.error,
        timestamp: Date.now(),
      };
      this.connector.send(ack);
    } else if (msg.type === 'config.sync.request') {
      await this.sendConfigSync();
    }
  }

  private async sendConfigSync(): Promise<void> {
    const [connectors, skills, tools] = await Promise.all([
      this.hermes.getConnectors(),
      this.hermes.getSkills(),
      this.hermes.getTools(),
    ]);

    const response: ConfigSyncResponse = {
      type: 'config.sync.response',
      tenantId: this.config.tenantId,
      timestamp: Date.now(),
      connectors: connectors.map(c => ({ type: c.type, status: c.status, config: {} })),
      skills: skills.map(s => ({ id: s.id, status: s.status, config: s.config })),
      tools: tools.map(t => ({ name: t.name, enabled: t.enabled })),
      schedules: [],
    };
    this.connector.send(response);
  }

  private onConnected(): void {
    this.sendHeartbeat();
  }

  private onError(err: Error): void {
    console.error('[sidecar] connector error:', err.message);
  }
}
