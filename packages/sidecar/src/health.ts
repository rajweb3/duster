import type { TenantStatus } from '@duster/shared';
import { HermesClient } from './hermes-client.js';

export interface HealthState {
  status: TenantStatus;
  modelLoaded: boolean;
  modelName: string;
  inferenceSpeed: number;
  activeSessions: number;
  queueDepth: number;
  cpuPercent: number;
  memoryUsedMB: number;
  diskUsedPercent: number;
  lastCheck: number;
  consecutiveFailures: number;
}

export class HealthMonitor {
  private state: HealthState = {
    status: 'healthy',
    modelLoaded: false,
    modelName: 'muse-glimmer',
    inferenceSpeed: 0,
    activeSessions: 0,
    queueDepth: 0,
    cpuPercent: 0,
    memoryUsedMB: 0,
    diskUsedPercent: 0,
    lastCheck: 0,
    consecutiveFailures: 0,
  };

  private readonly hermes: HermesClient;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private readonly checkIntervalMs: number;

  constructor(hermes: HermesClient, checkIntervalMs = 10000) {
    this.hermes = hermes;
    this.checkIntervalMs = checkIntervalMs;
  }

  getState(): HealthState {
    return { ...this.state };
  }

  start(): void {
    if (this.checkInterval) return;
    this.check();
    this.checkInterval = setInterval(() => this.check(), this.checkIntervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async check(): Promise<HealthState> {
    try {
      const [health, metrics] = await Promise.all([
        this.hermes.getHealth(),
        this.hermes.getSystemMetrics(),
      ]);

      this.state = {
        status: health.status,
        modelLoaded: health.model.loaded,
        modelName: health.model.name,
        inferenceSpeed: health.model.inferenceSpeed,
        activeSessions: health.agent.activeSessions,
        queueDepth: health.agent.queueDepth,
        cpuPercent: metrics.cpuPercent,
        memoryUsedMB: metrics.memoryUsedMB,
        diskUsedPercent: metrics.diskUsedPercent,
        lastCheck: Date.now(),
        consecutiveFailures: 0,
      };

      this.state.status = this.computeStatus();
    } catch {
      this.state.consecutiveFailures++;
      if (this.state.consecutiveFailures >= 3) {
        this.state.status = 'error';
      } else {
        this.state.status = 'degraded';
      }
      this.state.lastCheck = Date.now();
    }

    return this.getState();
  }

  private computeStatus(): TenantStatus {
    if (!this.state.modelLoaded) return 'error';
    if (this.state.cpuPercent > 95) return 'degraded';
    if (this.state.memoryUsedMB > 22000) return 'degraded';
    if (this.state.diskUsedPercent > 90) return 'degraded';
    if (this.state.queueDepth > 10) return 'degraded';
    return 'healthy';
  }
}
