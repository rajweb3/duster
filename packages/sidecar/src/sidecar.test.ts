import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBuffer } from './event-buffer.js';
import { HealthMonitor } from './health.js';
import { HermesClient } from './hermes-client.js';
import { DashboardConnector } from './connector.js';
import { loadConfig } from './config.js';
import type { TenantMessage } from '@duster/shared';

describe('EventBuffer', () => {
  let buffer: EventBuffer;

  beforeEach(() => {
    buffer = new EventBuffer(5, 10240);
  });

  it('stores and drains messages in order', () => {
    const msg1: TenantMessage = {
      type: 'heartbeat',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: 1000,
      status: 'healthy',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45 },
      agent: { activeSessions: 0, queueDepth: 0 },
      system: { cpuPercent: 20, memoryUsedMB: 8000, diskUsedPercent: 35 },
    };
    const msg2: TenantMessage = { ...msg1, timestamp: 2000 };

    buffer.push(msg1);
    buffer.push(msg2);

    expect(buffer.length).toBe(2);
    const drained = buffer.drain();
    expect(drained).toHaveLength(2);
    expect(drained[0].timestamp).toBe(1000);
    expect(drained[1].timestamp).toBe(2000);
    expect(buffer.length).toBe(0);
  });

  it('evicts oldest when max events reached', () => {
    const makeMsg = (ts: number): TenantMessage => ({
      type: 'heartbeat',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: ts,
      status: 'healthy',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45 },
      agent: { activeSessions: 0, queueDepth: 0 },
      system: { cpuPercent: 20, memoryUsedMB: 8000, diskUsedPercent: 35 },
    });

    for (let i = 0; i < 7; i++) {
      buffer.push(makeMsg(i));
    }

    expect(buffer.length).toBe(5);
    const drained = buffer.drain();
    expect(drained[0].timestamp).toBe(2);
    expect(drained[4].timestamp).toBe(6);
  });

  it('evicts when max size exceeded', () => {
    const smallBuffer = new EventBuffer(100, 500);
    const msg: TenantMessage = {
      type: 'heartbeat',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: 1000,
      status: 'healthy',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45 },
      agent: { activeSessions: 0, queueDepth: 0 },
      system: { cpuPercent: 20, memoryUsedMB: 8000, diskUsedPercent: 35 },
    };

    let pushed = 0;
    for (let i = 0; i < 10; i++) {
      if (smallBuffer.push({ ...msg, timestamp: i })) pushed++;
    }

    expect(smallBuffer.sizeBytes).toBeLessThanOrEqual(500);
  });

  it('returns false for oversized single message', () => {
    const tinyBuffer = new EventBuffer(10, 10);
    const msg: TenantMessage = {
      type: 'heartbeat',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: 1000,
      status: 'healthy',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45 },
      agent: { activeSessions: 0, queueDepth: 0 },
      system: { cpuPercent: 20, memoryUsedMB: 8000, diskUsedPercent: 35 },
    };
    expect(tinyBuffer.push(msg)).toBe(false);
  });

  it('drain returns empty array when buffer empty', () => {
    expect(buffer.drain()).toEqual([]);
  });
});

describe('loadConfig', () => {
  it('loads config from env', () => {
    const env = {
      DUSTER_TENANT_ID: '550e8400-e29b-41d4-a716-446655440000',
      DUSTER_DASHBOARD_URL: 'wss://dashboard.duster.dev',
    };
    const config = loadConfig(env);
    expect(config.tenantId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(config.dashboardUrl).toBe('wss://dashboard.duster.dev');
    expect(config.heartbeatIntervalMs).toBe(30000);
    expect(config.maxBufferedEvents).toBe(1000);
  });

  it('throws if DUSTER_TENANT_ID missing', () => {
    expect(() => loadConfig({})).toThrow('DUSTER_TENANT_ID is required');
  });

  it('throws if DUSTER_DASHBOARD_URL missing', () => {
    expect(() => loadConfig({ DUSTER_TENANT_ID: 'abc' })).toThrow('DUSTER_DASHBOARD_URL is required');
  });

  it('uses custom values from env', () => {
    const config = loadConfig({
      DUSTER_TENANT_ID: 'test',
      DUSTER_DASHBOARD_URL: 'wss://test',
      DUSTER_HEARTBEAT_MS: '5000',
      DUSTER_RECONNECT_BASE_MS: '2000',
      DUSTER_RECONNECT_MAX_MS: '120000',
      DUSTER_MAX_BUFFER_EVENTS: '500',
    });
    expect(config.heartbeatIntervalMs).toBe(5000);
    expect(config.reconnectBaseMs).toBe(2000);
    expect(config.reconnectMaxMs).toBe(120000);
    expect(config.maxBufferedEvents).toBe(500);
  });
});

describe('HealthMonitor', () => {
  it('reports error after 3 consecutive failures', async () => {
    const hermes = new HermesClient('http://localhost:99999');
    const monitor = new HealthMonitor(hermes, 60000);

    await monitor.check();
    expect(monitor.getState().status).toBe('degraded');

    await monitor.check();
    expect(monitor.getState().status).toBe('degraded');

    await monitor.check();
    expect(monitor.getState().status).toBe('error');
  });

  it('returns initial healthy state', () => {
    const hermes = new HermesClient('http://localhost:8080');
    const monitor = new HealthMonitor(hermes);
    const state = monitor.getState();
    expect(state.status).toBe('healthy');
    expect(state.modelLoaded).toBe(false);
    expect(state.consecutiveFailures).toBe(0);
  });
});

describe('DashboardConnector', () => {
  it('starts in disconnected state', () => {
    const config = loadConfig({
      DUSTER_TENANT_ID: '550e8400-e29b-41d4-a716-446655440000',
      DUSTER_DASHBOARD_URL: 'wss://dashboard.duster.dev',
    });
    const connector = new DashboardConnector(config);
    expect(connector.getState()).toBe('disconnected');
    expect(connector.getBufferLength()).toBe(0);
  });

  it('buffers messages when disconnected', () => {
    const config = loadConfig({
      DUSTER_TENANT_ID: '550e8400-e29b-41d4-a716-446655440000',
      DUSTER_DASHBOARD_URL: 'wss://dashboard.duster.dev',
    });
    const connector = new DashboardConnector(config);
    const msg: TenantMessage = {
      type: 'heartbeat',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: Date.now(),
      status: 'healthy',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45 },
      agent: { activeSessions: 0, queueDepth: 0 },
      system: { cpuPercent: 20, memoryUsedMB: 8000, diskUsedPercent: 35 },
    };

    const buffered = connector.send(msg);
    expect(buffered).toBe(true);
    expect(connector.getBufferLength()).toBe(1);
  });
});
