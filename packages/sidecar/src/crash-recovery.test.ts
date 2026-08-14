import { describe, it, expect, beforeEach } from 'vitest';
import { CrashRecovery, detectOOM, getRecoveryAction, type CrashRecoveryConfig, type ProcessState } from './crash-recovery.js';

const defaultConfig: CrashRecoveryConfig = {
  maxRestarts: 5,
  backoffBaseMs: 100,
  backoffMaxMs: 5000,
  oomThresholdMB: 22000,
  healthCheckUrl: 'http://127.0.0.1:8080/health',
  healthCheckIntervalMs: 10000,
};

describe('CrashRecovery', () => {
  let recovery: CrashRecovery;

  beforeEach(() => {
    recovery = new CrashRecovery(defaultConfig);
  });

  it('starts with initial state', () => {
    const state = recovery.getState();
    expect(state.running).toBe(false);
    expect(state.restartCount).toBe(0);
    expect(state.pid).toBeNull();
  });

  it('tracks process start', () => {
    recovery.reportProcessStarted(12345);
    const state = recovery.getState();
    expect(state.pid).toBe(12345);
    expect(state.running).toBe(true);
    expect(state.lastStart).not.toBeNull();
  });

  it('emits started event', () => {
    const events: any[] = [];
    recovery.on('started', (e) => events.push(e));
    recovery.reportProcessStarted(100);
    expect(events).toHaveLength(1);
    expect(events[0].pid).toBe(100);
  });

  it('detects OOM kill (exit code 137)', () => {
    recovery.reportProcessStarted(100);
    recovery.reportProcessExited(137, 'SIGKILL');
    const state = recovery.getState();
    expect(state.oomKilled).toBe(true);
    expect(state.running).toBe(false);
  });

  it('emits oom_killed event', () => {
    const events: any[] = [];
    recovery.on('oom_killed', (e) => events.push(e));
    recovery.reportProcessStarted(100);
    recovery.reportProcessExited(137);
    expect(events).toHaveLength(1);
  });

  it('emits crashed event with details', () => {
    const events: any[] = [];
    recovery.on('crashed', (e) => events.push(e));
    recovery.reportProcessStarted(100);
    recovery.reportProcessExited(1);
    expect(events).toHaveLength(1);
    expect(events[0].exitCode).toBe(1);
    expect(events[0].oomKilled).toBe(false);
  });

  it('schedules restart with backoff', () => {
    const events: any[] = [];
    recovery.on('restart_scheduled', (e) => events.push(e));
    recovery.reportProcessStarted(100);
    recovery.reportProcessExited(1);
    expect(events).toHaveLength(1);
    expect(events[0].attempt).toBe(1);
    expect(events[0].delayMs).toBe(200); // baseMs * 2^1
    recovery.stop();
  });

  it('uses exponential backoff', () => {
    expect(recovery.getBackoffDelay()).toBe(100); // 100 * 2^0
    recovery.reportProcessStarted(100);
    recovery.reportProcessExited(1);
    expect(recovery.getBackoffDelay()).toBe(200); // 100 * 2^1
    recovery.stop();
  });

  it('caps backoff at max', () => {
    for (let i = 0; i < 10; i++) {
      recovery.reportProcessStarted(100);
      recovery.reportProcessExited(1);
    }
    expect(recovery.getBackoffDelay()).toBeLessThanOrEqual(5000);
    recovery.stop();
  });

  it('emits max_restarts_exceeded when limit hit', () => {
    const events: any[] = [];
    recovery.on('max_restarts_exceeded', (e) => events.push(e));

    for (let i = 0; i < 6; i++) {
      recovery.reportProcessStarted(100);
      recovery.reportProcessExited(1);
    }

    expect(events).toHaveLength(1);
    expect(events[0].restartCount).toBe(5);
    recovery.stop();
  });

  it('shouldRestart returns false after max', () => {
    for (let i = 0; i < 5; i++) {
      recovery.reportProcessStarted(100);
      recovery.reportProcessExited(1);
    }
    expect(recovery.shouldRestart()).toBe(false);
    recovery.stop();
  });

  it('resetRestartCount clears counter', () => {
    recovery.reportProcessStarted(100);
    recovery.reportProcessExited(1);
    expect(recovery.getState().restartCount).toBe(1);
    recovery.resetRestartCount();
    expect(recovery.getState().restartCount).toBe(0);
    recovery.stop();
  });

  it('emits restart_requested after delay', async () => {
    const fastConfig = { ...defaultConfig, backoffBaseMs: 10, backoffMaxMs: 50 };
    const fastRecovery = new CrashRecovery(fastConfig);
    const events: any[] = [];
    fastRecovery.on('restart_requested', (e) => events.push(e));
    fastRecovery.reportProcessStarted(100);
    fastRecovery.reportProcessExited(1);
    await new Promise(r => setTimeout(r, 50));
    expect(events).toHaveLength(1);
    fastRecovery.stop();
  });

  it('stop cancels pending restart', () => {
    const events: any[] = [];
    recovery.on('restart_requested', (e) => events.push(e));
    recovery.reportProcessStarted(100);
    recovery.reportProcessExited(1);
    recovery.stop();
    // Wait to ensure timer doesn't fire
    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(events).toHaveLength(0);
        resolve();
      }, 300);
    });
  });
});

describe('detectOOM', () => {
  it('returns true when above threshold', () => {
    expect(detectOOM(23000, 22000)).toBe(true);
  });

  it('returns false when below threshold', () => {
    expect(detectOOM(18000, 22000)).toBe(false);
  });

  it('returns true at exact threshold', () => {
    expect(detectOOM(22000, 22000)).toBe(true);
  });
});

describe('getRecoveryAction', () => {
  it('returns restart_with_reduced_context for OOM', () => {
    const state: ProcessState = {
      pid: 100, running: false, restartCount: 1,
      lastCrash: Date.now(), lastStart: Date.now() - 1000,
      exitCode: 137, oomKilled: true,
    };
    expect(getRecoveryAction(state, defaultConfig)).toBe('restart_with_reduced_context');
  });

  it('returns alert_operator when max restarts exceeded', () => {
    const state: ProcessState = {
      pid: 100, running: false, restartCount: 5,
      lastCrash: Date.now(), lastStart: Date.now() - 1000,
      exitCode: 1, oomKilled: false,
    };
    expect(getRecoveryAction(state, defaultConfig)).toBe('alert_operator');
  });

  it('returns restart_clean for exit code 1', () => {
    const state: ProcessState = {
      pid: 100, running: false, restartCount: 2,
      lastCrash: Date.now(), lastStart: Date.now() - 1000,
      exitCode: 1, oomKilled: false,
    };
    expect(getRecoveryAction(state, defaultConfig)).toBe('restart_clean');
  });

  it('returns restart_normal for other cases', () => {
    const state: ProcessState = {
      pid: 100, running: false, restartCount: 2,
      lastCrash: Date.now(), lastStart: Date.now() - 1000,
      exitCode: 2, oomKilled: false,
    };
    expect(getRecoveryAction(state, defaultConfig)).toBe('restart_normal');
  });
});
