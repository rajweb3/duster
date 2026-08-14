import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { DashboardWsServer } from './server.js';
import { TenantStore } from './tenant-store.js';
import { createToken, verifyToken, extractToken, extractTenantId } from './auth.js';

const JWT_SECRET = 'test-secret-key-for-testing';
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('TenantStore', () => {
  let store: TenantStore;

  beforeEach(() => {
    store = new TenantStore();
  });

  it('starts empty', () => {
    expect(store.size()).toBe(0);
    expect(store.getAll()).toEqual([]);
  });

  it('adds and retrieves tenant', () => {
    const mockWs = { readyState: WebSocket.OPEN, close: () => {} } as any;
    store.add(TENANT_ID, mockWs);
    expect(store.size()).toBe(1);
    expect(store.has(TENANT_ID)).toBe(true);
    const conn = store.get(TENANT_ID);
    expect(conn?.tenantId).toBe(TENANT_ID);
  });

  it('removes tenant', () => {
    const mockWs = { readyState: WebSocket.OPEN, close: () => {} } as any;
    store.add(TENANT_ID, mockWs);
    store.remove(TENANT_ID);
    expect(store.size()).toBe(0);
    expect(store.has(TENANT_ID)).toBe(false);
  });

  it('replaces existing connection', () => {
    const closeCalled: number[] = [];
    const ws1 = { readyState: WebSocket.OPEN, close: () => closeCalled.push(1) } as any;
    const ws2 = { readyState: WebSocket.OPEN, close: () => closeCalled.push(2) } as any;
    store.add(TENANT_ID, ws1);
    store.add(TENANT_ID, ws2);
    expect(store.size()).toBe(1);
    expect(closeCalled).toContain(1);
  });

  it('updates heartbeat', () => {
    const mockWs = { readyState: WebSocket.OPEN, close: () => {} } as any;
    store.add(TENANT_ID, mockWs);
    store.updateHeartbeat(TENANT_ID, 'degraded');
    const conn = store.get(TENANT_ID);
    expect(conn?.status).toBe('degraded');
  });

  it('finds stale connections', () => {
    const mockWs = { readyState: WebSocket.OPEN, close: () => {} } as any;
    const conn = store.add(TENANT_ID, mockWs);
    conn.lastHeartbeat = Date.now() - 120000;
    const stale = store.getStale(90000);
    expect(stale).toHaveLength(1);
    expect(stale[0].tenantId).toBe(TENANT_ID);
  });
});

describe('Auth', () => {
  it('creates and verifies JWT token', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET);
    const decoded = await verifyToken(token, JWT_SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.tenantId).toBe(TENANT_ID);
  });

  it('rejects invalid secret', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET);
    const decoded = await verifyToken(token, 'wrong-secret');
    expect(decoded).toBeNull();
  });

  it('rejects expired token', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET, '0s');
    const decoded = await verifyToken(token, JWT_SECRET);
    expect(decoded).toBeNull();
  });

  it('extractToken parses Bearer header', () => {
    const req = { headers: { authorization: 'Bearer abc123' } } as any;
    expect(extractToken(req)).toBe('abc123');
  });

  it('extractToken returns null for missing header', () => {
    const req = { headers: {} } as any;
    expect(extractToken(req)).toBeNull();
  });

  it('extractTenantId from query param', () => {
    const req = { url: '/ws?tenantId=test-id', headers: { host: 'localhost' } } as any;
    expect(extractTenantId(req)).toBe('test-id');
  });

  it('extractTenantId from header', () => {
    const req = { url: '/ws', headers: { host: 'localhost', 'x-tenant-id': 'header-id' } } as any;
    expect(extractTenantId(req)).toBe('header-id');
  });
});

describe('DashboardWsServer', () => {
  let httpServer: Server;
  let wsServer: DashboardWsServer;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as any).port;
    wsServer = new DashboardWsServer({ server: httpServer, jwtSecret: JWT_SECRET });
  });

  afterEach(async () => {
    wsServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('rejects unauthenticated connections', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tenantId=${TENANT_ID}`);
    const error = await new Promise<any>((resolve) => {
      ws.on('error', resolve);
      ws.on('unexpected-response', (_req, res) => resolve({ statusCode: res.statusCode }));
    });
    expect(error.statusCode).toBe(401);
  });

  it('rejects invalid token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tenantId=${TENANT_ID}`, {
      headers: { authorization: 'Bearer invalid-token' },
    });
    const error = await new Promise<any>((resolve) => {
      ws.on('error', resolve);
      ws.on('unexpected-response', (_req, res) => resolve({ statusCode: res.statusCode }));
    });
    expect(error.statusCode).toBe(403);
  });

  it('accepts valid authenticated connection', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tenantId=${TENANT_ID}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    expect(wsServer.getStore().has(TENANT_ID)).toBe(true);
    ws.close();
    await new Promise(r => setTimeout(r, 50));
  });

  it('processes heartbeat message', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tenantId=${TENANT_ID}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({
      type: 'heartbeat',
      tenantId: TENANT_ID,
      timestamp: Date.now(),
      status: 'degraded',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 42 },
      agent: { activeSessions: 1, queueDepth: 0 },
      system: { cpuPercent: 80, memoryUsedMB: 20000, diskUsedPercent: 55 },
    }));

    await new Promise(r => setTimeout(r, 50));
    const conn = wsServer.getStore().get(TENANT_ID);
    expect(conn?.status).toBe('degraded');
    ws.close();
    await new Promise(r => setTimeout(r, 50));
  });

  it('sends command to tenant', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tenantId=${TENANT_ID}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    const received: string[] = [];
    ws.on('message', (data) => received.push(data.toString()));
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const command = {
      type: 'command' as const,
      commandId: '660e8400-e29b-41d4-a716-446655440001',
      tenantId: TENANT_ID,
      action: 'skill.activate' as const,
      payload: { skillId: 'slack-triage' },
    };

    const sent = wsServer.sendCommand(TENANT_ID, command);
    expect(sent).toBe(true);

    await new Promise(r => setTimeout(r, 50));
    const parsed = JSON.parse(received[received.length - 1]);
    expect(parsed.type).toBe('command');
    expect(parsed.action).toBe('skill.activate');

    ws.close();
    await new Promise(r => setTimeout(r, 50));
  });

  it('returns false for command to disconnected tenant', () => {
    const command = {
      type: 'command' as const,
      commandId: '660e8400-e29b-41d4-a716-446655440001',
      tenantId: 'nonexistent',
      action: 'agent.restart' as const,
      payload: {},
    };
    expect(wsServer.sendCommand('nonexistent', command)).toBe(false);
  });

  it('cleans up on close', async () => {
    const token = await createToken(TENANT_ID, JWT_SECRET);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tenantId=${TENANT_ID}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    await new Promise<void>((resolve) => ws.on('open', resolve));
    expect(wsServer.getStore().size()).toBe(1);

    ws.close();
    await new Promise(r => setTimeout(r, 50));
    expect(wsServer.getStore().size()).toBe(0);
  });
});
