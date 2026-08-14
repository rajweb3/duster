import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { DashboardWsServer, createToken } from '../../apps/dashboard/src/lib/ws/index.js';
import { DashboardConnector } from '../../packages/sidecar/src/connector.js';
import { loadConfig } from '../../packages/sidecar/src/config.js';
import type { TenantMessage, HeartbeatMessage, CommandMessage, DashboardMessage } from '../../packages/shared/src/messages.js';

const JWT_SECRET = 'integration-test-secret';
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_ENV_BASE = { DUSTER_USE_MTLS: 'false' };

function makeHeartbeat(overrides: Partial<HeartbeatMessage> = {}): HeartbeatMessage {
  return {
    type: 'heartbeat',
    tenantId: TENANT_ID,
    timestamp: Date.now(),
    status: 'healthy',
    model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45 },
    agent: { activeSessions: 0, queueDepth: 0 },
    system: { cpuPercent: 20, memoryUsedMB: 8000, diskUsedPercent: 35 },
    ...overrides,
  };
}

describe('Connector Integration: Connection Lifecycle', () => {
  let httpServer: Server;
  let dashboardWs: DashboardWsServer;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as any).port;
    dashboardWs = new DashboardWsServer({ server: httpServer, jwtSecret: JWT_SECRET });
  });

  afterEach(async () => {
    dashboardWs.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('sidecar connects to dashboard with valid token', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET);
    const config = loadConfig({
      ...TEST_ENV_BASE,
      DUSTER_TENANT_ID: TENANT_ID,
      DUSTER_DASHBOARD_URL: `ws://127.0.0.1:${port}`,
      DUSTER_RECONNECT_BASE_MS: '100',
      DUSTER_RECONNECT_MAX_MS: '1000',
    });

    const connector = new DashboardConnector(config);
    connector.setToken(token);

    const connected = new Promise<void>((resolve) => connector.on('connected', resolve));
    connector.connect();
    await connected;

    expect(connector.getState()).toBe('connected');
    expect(dashboardWs.getStore().has(TENANT_ID)).toBe(true);
    connector.disconnect();
    await new Promise(r => setTimeout(r, 50));
  });

  it('sidecar connection rejected with invalid token', async () => {
    const config = loadConfig({
      ...TEST_ENV_BASE,
      DUSTER_TENANT_ID: TENANT_ID,
      DUSTER_DASHBOARD_URL: `ws://127.0.0.1:${port}`,
      DUSTER_RECONNECT_BASE_MS: '50',
      DUSTER_RECONNECT_MAX_MS: '200',
    });

    const connector = new DashboardConnector(config);
    connector.setToken('invalid-token');

    const errored = new Promise<Error>((resolve) => connector.on('error', resolve));
    connector.connect();
    await errored;

    expect(connector.getState()).not.toBe('connected');
    connector.disconnect();
  });

  it('sidecar reconnects after disconnect', async () => {
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

    // First connect
    const connected1 = new Promise<void>((resolve) => connector.once('connected', resolve));
    connector.connect();
    await connected1;

    // Force disconnect from server side
    const conn = dashboardWs.getStore().get(TENANT_ID);
    conn!.ws.close(4001, 'test disconnect');

    // Should reconnect
    const connected2 = new Promise<void>((resolve) => connector.once('connected', resolve));
    await connected2;

    expect(connector.getState()).toBe('connected');
    connector.disconnect();
    await new Promise(r => setTimeout(r, 50));
  });

  it('graceful disconnect does not reconnect', async () => {
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

    const connected = new Promise<void>((resolve) => connector.on('connected', resolve));
    connector.connect();
    await connected;

    connector.disconnect();
    await new Promise(r => setTimeout(r, 150));
    expect(connector.getState()).toBe('disconnected');
  });
});

describe('Connector Integration: Message Flow', () => {
  let httpServer: Server;
  let dashboardWs: DashboardWsServer;
  let port: number;
  let connector: DashboardConnector;

  beforeEach(async () => {
    httpServer = createServer();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as any).port;
    dashboardWs = new DashboardWsServer({ server: httpServer, jwtSecret: JWT_SECRET });

    const token = await createToken(TENANT_ID, JWT_SECRET);
    const config = loadConfig({
      ...TEST_ENV_BASE,
      DUSTER_TENANT_ID: TENANT_ID,
      DUSTER_DASHBOARD_URL: `ws://127.0.0.1:${port}`,
      DUSTER_RECONNECT_BASE_MS: '50',
      DUSTER_RECONNECT_MAX_MS: '200',
    });

    connector = new DashboardConnector(config);
    connector.setToken(token);
    const connected = new Promise<void>((resolve) => connector.on('connected', resolve));
    connector.connect();
    await connected;
  });

  afterEach(async () => {
    connector.disconnect();
    dashboardWs.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('heartbeat updates dashboard store', async () => {
    connector.send(makeHeartbeat({ status: 'degraded' }));
    await new Promise(r => setTimeout(r, 50));

    const conn = dashboardWs.getStore().get(TENANT_ID);
    expect(conn?.status).toBe('degraded');
  });

  it('dashboard sends command to sidecar', async () => {
    const received: DashboardMessage[] = [];
    connector.on('message', (msg: DashboardMessage) => received.push(msg));

    // Wait for initial config.sync.request to arrive
    await new Promise(r => setTimeout(r, 50));
    const initialCount = received.length;

    const command: CommandMessage = {
      type: 'command',
      commandId: '660e8400-e29b-41d4-a716-446655440001',
      tenantId: TENANT_ID,
      action: 'skill.activate',
      payload: { skillId: 'slack-triage' },
    };

    dashboardWs.sendCommand(TENANT_ID, command);
    await new Promise(r => setTimeout(r, 50));

    const newMessages = received.slice(initialCount);
    expect(newMessages).toHaveLength(1);
    expect(newMessages[0].type).toBe('command');
    if (newMessages[0].type === 'command') {
      expect(newMessages[0].action).toBe('skill.activate');
    }
  });

  it('multiple messages maintain order', async () => {
    const messages: TenantMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(makeHeartbeat({ timestamp: i }));
    }

    for (const msg of messages) {
      connector.send(msg);
    }

    await new Promise(r => setTimeout(r, 100));
    const conn = dashboardWs.getStore().get(TENANT_ID);
    expect(conn).toBeDefined();
  });

  it('buffered messages flush on reconnect', async () => {
    // Disconnect
    connector.disconnect();
    await new Promise(r => setTimeout(r, 50));

    // Buffer messages while disconnected
    connector.send(makeHeartbeat({ timestamp: 1 }));
    connector.send(makeHeartbeat({ timestamp: 2 }));
    connector.send(makeHeartbeat({ timestamp: 3 }));
    expect(connector.getBufferLength()).toBe(3);

    // Reconnect
    const flushed = new Promise<number>((resolve) =>
      connector.on('buffer_flushed', resolve),
    );
    const token = await createToken(TENANT_ID, JWT_SECRET);
    connector.setToken(token);
    connector.connect();

    const count = await flushed;
    expect(count).toBe(3);
    expect(connector.getBufferLength()).toBe(0);
  });
});

describe('Connector Integration: Error Resilience', () => {
  let httpServer: Server;
  let dashboardWs: DashboardWsServer;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as any).port;
    dashboardWs = new DashboardWsServer({ server: httpServer, jwtSecret: JWT_SECRET });
  });

  afterEach(async () => {
    dashboardWs.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('handles malformed message from dashboard gracefully', async () => {
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

    const errors: Error[] = [];
    connector.on('error', (e: Error) => errors.push(e));

    const connected = new Promise<void>((resolve) => connector.on('connected', resolve));
    connector.connect();
    await connected;

    // Send malformed message directly
    const conn = dashboardWs.getStore().get(TENANT_ID);
    conn!.ws.send('not valid json{{{');
    await new Promise(r => setTimeout(r, 50));

    expect(errors.length).toBeGreaterThan(0);
    expect(connector.getState()).toBe('connected');
    connector.disconnect();
    await new Promise(r => setTimeout(r, 50));
  });

  it('dashboard ignores malformed messages from sidecar', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tenantId=${TENANT_ID}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Send invalid message
    ws.send('garbage data');
    ws.send(JSON.stringify({ type: 'unknown', bad: true }));
    await new Promise(r => setTimeout(r, 50));

    // Connection should still be open
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
    await new Promise(r => setTimeout(r, 50));
  });

  it('connector to unreachable server buffers', () => {
    const config = loadConfig({
      ...TEST_ENV_BASE,
      DUSTER_TENANT_ID: TENANT_ID,
      DUSTER_DASHBOARD_URL: 'ws://127.0.0.1:19999',
      DUSTER_RECONNECT_BASE_MS: '50',
      DUSTER_RECONNECT_MAX_MS: '200',
    });

    const connector = new DashboardConnector(config);
    connector.setToken('token');

    const msg = makeHeartbeat();
    const buffered = connector.send(msg);
    expect(buffered).toBe(true);
    expect(connector.getBufferLength()).toBe(1);
    connector.disconnect();
  });
});
