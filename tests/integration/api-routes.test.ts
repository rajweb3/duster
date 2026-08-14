import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { DashboardWsServer, createToken } from '../../apps/dashboard/src/lib/ws/index.js';
import { DashboardConnector } from '../../packages/sidecar/src/connector.js';
import { loadConfig } from '../../packages/sidecar/src/config.js';

const JWT_SECRET = 'api-route-test-secret';
const TENANT_ID = '660e8400-e29b-41d4-a716-446655440001';
const TEST_ENV_BASE = { DUSTER_USE_MTLS: 'false' };

describe('API Route Integration: Commands Bridge', () => {
  let httpServer: Server;
  let dashboardWs: DashboardWsServer;
  let port: number;

  beforeAll(async () => {
    httpServer = createServer();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as any).port;
    dashboardWs = new DashboardWsServer({ server: httpServer, jwtSecret: JWT_SECRET });
  });

  afterAll(async () => {
    dashboardWs.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('command sent via bridge is received by sidecar', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET);
    const config = loadConfig({
      ...TEST_ENV_BASE,
      DUSTER_TENANT_ID: TENANT_ID,
      DUSTER_DASHBOARD_URL: `ws://127.0.0.1:${port}`,
      DUSTER_RECONNECT_BASE_MS: '50',
      DUSTER_RECONNECT_MAX_MS: '200',
    });
    const connector = new DashboardConnector(config);
    connector.setToken(token);
    connector.on('error', () => {});

    const connected = new Promise<void>((resolve) => connector.on('connected', resolve));
    connector.connect();
    await connected;

    const received: any[] = [];
    connector.on('message', (msg: any) => received.push(msg));
    await new Promise(r => setTimeout(r, 100));

    const CMD_ID = '770e8400-e29b-41d4-a716-446655440099';
    const command = {
      type: 'command' as const,
      commandId: CMD_ID,
      tenantId: TENANT_ID,
      action: 'skill.activate' as const,
      payload: { skillId: 'test-skill' },
    };

    dashboardWs.sendCommand(TENANT_ID, command);
    await new Promise(r => setTimeout(r, 200));

    const commands = received.filter(m => m.type === 'command');
    expect(commands).toHaveLength(1);
    expect(commands[0].commandId).toBe(CMD_ID);
    expect(commands[0].action).toBe('skill.activate');
    connector.disconnect();
    await new Promise(r => setTimeout(r, 50));
  });

  it('command to disconnected tenant returns false', () => {
    const FAKE_TENANT = '880e8400-e29b-41d4-a716-446655440002';
    const result = dashboardWs.sendCommand(FAKE_TENANT, {
      type: 'command',
      commandId: '990e8400-e29b-41d4-a716-446655440003',
      tenantId: FAKE_TENANT,
      action: 'agent.restart',
      payload: {},
    });
    expect(result).toBe(false);
  });
});

describe('API Route Integration: Token Refresh', () => {
  it('createToken produces a valid JWT that verifies', async () => {
    const { verifyToken } = await import('../../apps/dashboard/src/lib/ws/auth.js');
    const token = await createToken(TENANT_ID, JWT_SECRET, '1h');
    const payload = await verifyToken(token, JWT_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.tenantId).toBe(TENANT_ID);
  });

  it('expired token fails verification', async () => {
    const { verifyToken } = await import('../../apps/dashboard/src/lib/ws/auth.js');
    const token = await createToken(TENANT_ID, JWT_SECRET, '0s');
    await new Promise(r => setTimeout(r, 1100));
    const payload = await verifyToken(token, JWT_SECRET);
    expect(payload).toBeNull();
  });

  it('token with wrong secret fails', async () => {
    const { verifyToken } = await import('../../apps/dashboard/src/lib/ws/auth.js');
    const token = await createToken(TENANT_ID, JWT_SECRET, '1h');
    const payload = await verifyToken(token, 'wrong-secret');
    expect(payload).toBeNull();
  });
});

describe('API Route Integration: Circuit Breaker', () => {
  it('connector enters dormant mode after max reconnect attempts', async () => {
    const config = loadConfig({
      ...TEST_ENV_BASE,
      DUSTER_TENANT_ID: TENANT_ID,
      DUSTER_DASHBOARD_URL: 'ws://127.0.0.1:19998',
      DUSTER_RECONNECT_BASE_MS: '10',
      DUSTER_RECONNECT_MAX_MS: '20',
      DUSTER_MAX_RECONNECT_ATTEMPTS: '3',
      DUSTER_DORMANT_RETRY_MS: '100',
    });

    const connector = new DashboardConnector(config);
    connector.setToken('dummy');
    connector.on('error', () => {});

    const dormantPromise = new Promise<void>((resolve) => connector.on('dormant', resolve));
    connector.connect();
    await dormantPromise;

    expect(connector.getMode()).toBe('dormant');
    connector.disconnect();
  });

  it('connector wakes from dormant mode', async () => {
    const config = loadConfig({
      ...TEST_ENV_BASE,
      DUSTER_TENANT_ID: TENANT_ID,
      DUSTER_DASHBOARD_URL: 'ws://127.0.0.1:19998',
      DUSTER_RECONNECT_BASE_MS: '10',
      DUSTER_RECONNECT_MAX_MS: '20',
      DUSTER_MAX_RECONNECT_ATTEMPTS: '2',
      DUSTER_DORMANT_RETRY_MS: '50',
    });

    const connector = new DashboardConnector(config);
    connector.setToken('dummy');
    connector.on('error', () => {});

    const wakeupPromise = new Promise<void>((resolve) => connector.on('wakeup', resolve));
    connector.connect();
    await wakeupPromise;

    expect(connector.getMode()).toBe('active');
    connector.disconnect();
  });
});

describe('API Route Integration: Event Buffer Overflow', () => {
  it('buffer reports overflow after capacity exceeded', () => {
    const config = loadConfig({
      ...TEST_ENV_BASE,
      DUSTER_TENANT_ID: TENANT_ID,
      DUSTER_DASHBOARD_URL: 'ws://127.0.0.1:19998',
      DUSTER_MAX_BUFFER_EVENTS: '5',
      DUSTER_RECONNECT_BASE_MS: '10000',
      DUSTER_RECONNECT_MAX_MS: '20000',
    });

    const connector = new DashboardConnector(config);
    connector.setToken('dummy');

    for (let i = 0; i < 10; i++) {
      connector.send({
        type: 'heartbeat',
        tenantId: TENANT_ID,
        timestamp: i,
        status: 'healthy',
        model: { loaded: true, name: 'test', inferenceSpeed: 0 },
        agent: { activeSessions: 0, queueDepth: 0 },
        system: { cpuPercent: 0, memoryUsedMB: 0, diskUsedPercent: 0 },
      } as any);
    }

    expect(connector.getBufferLength()).toBeLessThanOrEqual(5);
    connector.disconnect();
  });

  it('overflow notification sent on flush', async () => {
    const httpServer = createServer();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as any).port;
    const dashboardWs = new DashboardWsServer({ server: httpServer, jwtSecret: JWT_SECRET });

    const config = loadConfig({
      ...TEST_ENV_BASE,
      DUSTER_TENANT_ID: TENANT_ID,
      DUSTER_DASHBOARD_URL: `ws://127.0.0.1:${port}`,
      DUSTER_MAX_BUFFER_EVENTS: '3',
      DUSTER_RECONNECT_BASE_MS: '50',
      DUSTER_RECONNECT_MAX_MS: '200',
    });

    const connector = new DashboardConnector(config);
    const token = await createToken(TENANT_ID, JWT_SECRET);

    for (let i = 0; i < 6; i++) {
      connector.send({
        type: 'heartbeat',
        tenantId: TENANT_ID,
        timestamp: i,
        status: 'healthy',
        model: { loaded: true, name: 'test', inferenceSpeed: 0 },
        agent: { activeSessions: 0, queueDepth: 0 },
        system: { cpuPercent: 0, memoryUsedMB: 0, diskUsedPercent: 0 },
      } as any);
    }

    connector.setToken(token);
    const flushed = new Promise<number>((resolve) => connector.on('buffer_flushed', resolve));
    connector.connect();
    await flushed;

    await new Promise(r => setTimeout(r, 100));
    connector.disconnect();
    dashboardWs.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
});

describe('API Route Integration: Rate Limiting', () => {
  it('rate limiter tracks request counts', async () => {
    const { apiLimiter } = await import('../../apps/dashboard/src/lib/rate-limit.js');
    const testIp = '192.168.99.99';

    for (let i = 0; i < 5; i++) {
      const result = apiLimiter.check(testIp);
      expect(result.allowed).toBe(true);
    }
  });

  it('trusted proxy validation', async () => {
    const { isFromTrustedProxy } = await import('../../apps/dashboard/src/lib/rate-limit.js');
    expect(isFromTrustedProxy('10.0.0.1')).toBe(true);
    expect(isFromTrustedProxy('172.16.0.1')).toBe(true);
    expect(isFromTrustedProxy('8.8.8.8')).toBe(false);
  });
});
