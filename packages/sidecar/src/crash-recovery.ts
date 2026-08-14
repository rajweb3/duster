import { EventEmitter } from 'events';

export interface ProcessState {
  pid: number | null;
  running: boolean;
  restartCount: number;
  lastCrash: number | null;
  lastStart: number | null;
  exitCode: number | null;
  oomKilled: boolean;
}

export interface CrashRecoveryConfig {
  maxRestarts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  oomThresholdMB: number;
  healthCheckUrl: string;
  healthCheckIntervalMs: number;
}

export class CrashRecovery extends EventEmitter {
  private state: ProcessState = {
    pid: null,
    running: false,
    restartCount: 0,
    lastCrash: null,
    lastStart: null,
    exitCode: null,
    oomKilled: false,
  };

  private readonly config: CrashRecoveryConfig;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: CrashRecoveryConfig) {
    super();
    this.config = config;
  }

  getState(): ProcessState {
    return { ...this.state };
  }

  reportProcessStarted(pid: number): void {
    this.state.pid = pid;
    this.state.running = true;
    this.state.lastStart = Date.now();
    this.state.exitCode = null;
    this.state.oomKilled = false;
    this.emit('started', { pid });
    this.startHealthCheck();
  }

  reportProcessExited(exitCode: number, signal?: string): void {
    this.state.running = false;
    this.state.exitCode = exitCode;
    this.state.lastCrash = Date.now();
    this.stopHealthCheck();

    const oomKilled = exitCode === 137 || signal === 'SIGKILL';
    this.state.oomKilled = oomKilled;

    if (oomKilled) {
      this.emit('oom_killed', { pid: this.state.pid, restartCount: this.state.restartCount });
    }

    this.emit('crashed', {
      exitCode,
      signal,
      oomKilled,
      restartCount: this.state.restartCount,
    });

    this.scheduleRestart();
  }

  reportHealthCheckFailed(): void {
    this.emit('health_check_failed', { pid: this.state.pid });
  }

  shouldRestart(): boolean {
    return this.state.restartCount < this.config.maxRestarts;
  }

  getBackoffDelay(): number {
    const delay = this.config.backoffBaseMs * Math.pow(2, this.state.restartCount);
    return Math.min(delay, this.config.backoffMaxMs);
  }

  resetRestartCount(): void {
    this.state.restartCount = 0;
  }

  stop(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.stopHealthCheck();
  }

  private scheduleRestart(): void {
    if (!this.shouldRestart()) {
      this.emit('max_restarts_exceeded', {
        restartCount: this.state.restartCount,
        maxRestarts: this.config.maxRestarts,
      });
      return;
    }

    this.state.restartCount++;
    const delay = this.getBackoffDelay();

    this.emit('restart_scheduled', {
      attempt: this.state.restartCount,
      delayMs: delay,
    });

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.emit('restart_requested', { attempt: this.state.restartCount });
    }, delay);
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(async () => {
      try {
        const res = await fetch(this.config.healthCheckUrl);
        if (!res.ok) {
          this.reportHealthCheckFailed();
        }
      } catch {
        this.reportHealthCheckFailed();
      }
    }, this.config.healthCheckIntervalMs);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
}

export function detectOOM(memoryUsedMB: number, thresholdMB: number): boolean {
  return memoryUsedMB >= thresholdMB;
}

export function getRecoveryAction(state: ProcessState, config: CrashRecoveryConfig): string {
  if (state.oomKilled) {
    return 'restart_with_reduced_context';
  }
  if (state.restartCount >= config.maxRestarts) {
    return 'alert_operator';
  }
  if (state.exitCode === 1) {
    return 'restart_clean';
  }
  return 'restart_normal';
}
