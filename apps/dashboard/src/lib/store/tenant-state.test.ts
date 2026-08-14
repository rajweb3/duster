import { describe, it, expect } from 'vitest';
import { createInitialState, applyMessage, type TenantDashboardState } from './tenant-state.js';
import type { HeartbeatMessage, MetricsMessage, SessionEventMessage, ConnectorStatusMessage, SkillStatusMessage, ToolRegistryMessage, MemoryStatsMessage } from '@duster/shared';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('createInitialState', () => {
  it('creates default state with correct tenant ID', () => {
    const state = createInitialState(TENANT_ID);
    expect(state.tenantId).toBe(TENANT_ID);
    expect(state.status).toBe('healthy');
    expect(state.connected).toBe(false);
    expect(state.connectors).toEqual([]);
    expect(state.skills).toEqual([]);
    expect(state.tools).toEqual([]);
    expect(state.sessions).toEqual([]);
  });
});

describe('applyMessage', () => {
  let state: TenantDashboardState;

  beforeEach(() => {
    state = createInitialState(TENANT_ID);
  });

  it('applies heartbeat message', () => {
    const msg: HeartbeatMessage = {
      type: 'heartbeat',
      tenantId: TENANT_ID,
      timestamp: 1000,
      status: 'degraded',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 42 },
      agent: { activeSessions: 2, queueDepth: 1 },
      system: { cpuPercent: 85, memoryUsedMB: 20000, diskUsedPercent: 60 },
    };

    const next = applyMessage(state, msg);
    expect(next.status).toBe('degraded');
    expect(next.lastHeartbeat).toBe(1000);
    expect(next.connected).toBe(true);
    expect(next.model.inferenceSpeed).toBe(42);
    expect(next.system.cpuPercent).toBe(85);
  });

  it('applies metrics message', () => {
    const msg: MetricsMessage = {
      type: 'metrics',
      tenantId: TENANT_ID,
      timestamp: 2000,
      tokensPerMinute: 150,
      activeSessions: 3,
      queueDepth: 2,
      inferenceSpeedTokS: 48,
      uptimeSeconds: 86400,
      errorRate: 0.01,
    };

    const next = applyMessage(state, msg);
    expect(next.metrics.tokensPerMinute).toBe(150);
    expect(next.metrics.uptimeSeconds).toBe(86400);
    expect(next.metrics.errorRate).toBe(0.01);
    expect(next.agent.activeSessions).toBe(3);
  });

  it('applies session event and caps at 100', () => {
    let current = state;
    for (let i = 0; i < 110; i++) {
      const msg: SessionEventMessage = {
        type: 'session.event',
        tenantId: TENANT_ID,
        sessionId: `sess_${i}`,
        event: 'started',
        timestamp: i * 1000,
        metadata: {},
      };
      current = applyMessage(current, msg);
    }
    expect(current.sessions).toHaveLength(100);
    expect(current.sessions[0].sessionId).toBe('sess_109');
  });

  it('applies connector status — adds new', () => {
    const msg: ConnectorStatusMessage = {
      type: 'connector.status',
      tenantId: TENANT_ID,
      connector: 'slack',
      status: 'connected',
    };

    const next = applyMessage(state, msg);
    expect(next.connectors).toHaveLength(1);
    expect(next.connectors[0].type).toBe('slack');
    expect(next.connectors[0].status).toBe('connected');
  });

  it('applies connector status — updates existing', () => {
    const msg1: ConnectorStatusMessage = {
      type: 'connector.status',
      tenantId: TENANT_ID,
      connector: 'slack',
      status: 'connected',
    };
    const msg2: ConnectorStatusMessage = {
      type: 'connector.status',
      tenantId: TENANT_ID,
      connector: 'slack',
      status: 'error',
      errorCode: 'TOKEN_EXPIRED',
    };

    let next = applyMessage(state, msg1);
    next = applyMessage(next, msg2);
    expect(next.connectors).toHaveLength(1);
    expect(next.connectors[0].status).toBe('error');
    expect(next.connectors[0].errorCode).toBe('TOKEN_EXPIRED');
  });

  it('applies skill status', () => {
    const msg: SkillStatusMessage = {
      type: 'skill.status',
      tenantId: TENANT_ID,
      skillId: 'slack-triage',
      status: 'active',
      runCount: 42,
    };

    const next = applyMessage(state, msg);
    expect(next.skills).toHaveLength(1);
    expect(next.skills[0].id).toBe('slack-triage');
    expect(next.skills[0].runCount).toBe(42);
  });

  it('applies tool registry', () => {
    const msg: ToolRegistryMessage = {
      type: 'tool.registry',
      tenantId: TENANT_ID,
      tools: [
        { name: 'web_search', enabled: true, description: 'Search the web' },
        { name: 'file_read', enabled: false },
      ],
    };

    const next = applyMessage(state, msg);
    expect(next.tools).toHaveLength(2);
    expect(next.tools[0].name).toBe('web_search');
    expect(next.tools[1].enabled).toBe(false);
  });

  it('applies memory stats', () => {
    const msg: MemoryStatsMessage = {
      type: 'memory.stats',
      tenantId: TENANT_ID,
      entryCount: 250,
      categories: ['prefs', 'patterns'],
    };

    const next = applyMessage(state, msg);
    expect(next.memoryStats.entryCount).toBe(250);
    expect(next.memoryStats.categories).toEqual(['prefs', 'patterns']);
  });

  it('does not mutate original state', () => {
    const msg: HeartbeatMessage = {
      type: 'heartbeat',
      tenantId: TENANT_ID,
      timestamp: 5000,
      status: 'error',
      model: { loaded: false, name: 'muse-glimmer', inferenceSpeed: 0 },
      agent: { activeSessions: 0, queueDepth: 5 },
      system: { cpuPercent: 99, memoryUsedMB: 23000, diskUsedPercent: 95 },
    };

    const next = applyMessage(state, msg);
    expect(state.status).toBe('healthy');
    expect(next.status).toBe('error');
  });
});
