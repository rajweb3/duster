import { describe, it, expect } from 'vitest';
import {
  HeartbeatMessage,
  MetricsMessage,
  SessionEventMessage,
  CommandMessage,
  CommandAckMessage,
  ConnectorStatusMessage,
  SkillStatusMessage,
  ToolRegistryMessage,
  MemoryStatsMessage,
  ConfigSyncRequest,
  ConfigSyncResponse,
  TenantMessage,
  DashboardMessage,
} from './messages.js';
import {
  validateTenantMessage,
  validateDashboardMessage,
  validateHeartbeat,
  validateCommand,
  parseJsonMessage,
} from './validation.js';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const COMMAND_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('HeartbeatMessage', () => {
  const valid = {
    type: 'heartbeat' as const,
    tenantId: TENANT_ID,
    timestamp: Date.now(),
    status: 'healthy' as const,
    model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45.2 },
    agent: { activeSessions: 2, queueDepth: 0 },
    system: { cpuPercent: 34.5, memoryUsedMB: 18200, diskUsedPercent: 42.0 },
  };

  it('validates a correct heartbeat', () => {
    const result = HeartbeatMessage.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects missing tenantId', () => {
    const { tenantId, ...invalid } = valid;
    const result = HeartbeatMessage.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = HeartbeatMessage.safeParse({ ...valid, status: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects cpu > 100', () => {
    const result = HeartbeatMessage.safeParse({
      ...valid,
      system: { ...valid.system, cpuPercent: 150 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative activeSessions', () => {
    const result = HeartbeatMessage.safeParse({
      ...valid,
      agent: { ...valid.agent, activeSessions: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe('MetricsMessage', () => {
  const valid = {
    type: 'metrics' as const,
    tenantId: TENANT_ID,
    timestamp: Date.now(),
    tokensPerMinute: 120.5,
    activeSessions: 1,
    queueDepth: 0,
    inferenceSpeedTokS: 48.3,
    uptimeSeconds: 86400,
    errorRate: 0.02,
  };

  it('validates correct metrics', () => {
    expect(MetricsMessage.safeParse(valid).success).toBe(true);
  });

  it('rejects errorRate > 1', () => {
    expect(MetricsMessage.safeParse({ ...valid, errorRate: 1.5 }).success).toBe(false);
  });
});

describe('SessionEventMessage', () => {
  const valid = {
    type: 'session.event' as const,
    tenantId: TENANT_ID,
    sessionId: 'sess_abc123',
    event: 'started' as const,
    timestamp: Date.now(),
    metadata: {},
  };

  it('validates started event', () => {
    expect(SessionEventMessage.safeParse(valid).success).toBe(true);
  });

  it('validates tool_called with metadata', () => {
    const msg = {
      ...valid,
      event: 'tool_called' as const,
      metadata: { toolName: 'web_search', tokensUsed: 150 },
    };
    expect(SessionEventMessage.safeParse(msg).success).toBe(true);
  });

  it('validates completed with duration', () => {
    const msg = {
      ...valid,
      event: 'completed' as const,
      metadata: { duration: 4500, tokensUsed: 320 },
    };
    expect(SessionEventMessage.safeParse(msg).success).toBe(true);
  });
});

describe('ConnectorStatusMessage', () => {
  it('validates connected status', () => {
    const msg = {
      type: 'connector.status' as const,
      tenantId: TENANT_ID,
      connector: 'slack' as const,
      status: 'connected' as const,
    };
    expect(ConnectorStatusMessage.safeParse(msg).success).toBe(true);
  });

  it('validates error with errorCode', () => {
    const msg = {
      type: 'connector.status' as const,
      tenantId: TENANT_ID,
      connector: 'email' as const,
      status: 'error' as const,
      errorCode: 'OAUTH_EXPIRED',
    };
    expect(ConnectorStatusMessage.safeParse(msg).success).toBe(true);
  });
});

describe('CommandMessage', () => {
  const valid = {
    type: 'command' as const,
    commandId: COMMAND_ID,
    tenantId: TENANT_ID,
    action: 'skill.activate' as const,
    payload: { skillId: 'slack-triage', config: { channels: ['general'] } },
  };

  it('validates skill.activate command', () => {
    expect(CommandMessage.safeParse(valid).success).toBe(true);
  });

  it('validates connector.configure', () => {
    const msg = {
      ...valid,
      action: 'connector.configure' as const,
      payload: { connector: 'slack', config: { webhookUrl: 'https://hooks.slack.com/xxx' } },
    };
    expect(CommandMessage.safeParse(msg).success).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(CommandMessage.safeParse({ ...valid, action: 'invalid.action' }).success).toBe(false);
  });
});

describe('CommandAckMessage', () => {
  it('validates success ack', () => {
    const msg = {
      type: 'command.ack' as const,
      commandId: COMMAND_ID,
      tenantId: TENANT_ID,
      success: true,
      timestamp: Date.now(),
    };
    expect(CommandAckMessage.safeParse(msg).success).toBe(true);
  });

  it('validates failure ack with error', () => {
    const msg = {
      type: 'command.ack' as const,
      commandId: COMMAND_ID,
      tenantId: TENANT_ID,
      success: false,
      error: 'Skill not found: invalid-skill',
      timestamp: Date.now(),
    };
    expect(CommandAckMessage.safeParse(msg).success).toBe(true);
  });
});

describe('SkillStatusMessage', () => {
  it('validates active skill', () => {
    const msg = {
      type: 'skill.status' as const,
      tenantId: TENANT_ID,
      skillId: 'slack-triage',
      status: 'active' as const,
      lastRun: Date.now() - 60000,
      nextRun: Date.now() + 300000,
      runCount: 42,
    };
    expect(SkillStatusMessage.safeParse(msg).success).toBe(true);
  });
});

describe('ToolRegistryMessage', () => {
  it('validates tool registry', () => {
    const msg = {
      type: 'tool.registry' as const,
      tenantId: TENANT_ID,
      tools: [
        { name: 'web_search', enabled: true, description: 'Search the web' },
        { name: 'file_read', enabled: false },
      ],
    };
    expect(ToolRegistryMessage.safeParse(msg).success).toBe(true);
  });
});

describe('MemoryStatsMessage', () => {
  it('validates memory stats', () => {
    const msg = {
      type: 'memory.stats' as const,
      tenantId: TENANT_ID,
      entryCount: 156,
      categories: ['customer_prefs', 'workflow_patterns', 'team_context'],
      lastUpdated: Date.now(),
    };
    expect(MemoryStatsMessage.safeParse(msg).success).toBe(true);
  });
});

describe('ConfigSyncRequest', () => {
  it('validates sync request', () => {
    const msg = { type: 'config.sync.request' as const, tenantId: TENANT_ID };
    expect(ConfigSyncRequest.safeParse(msg).success).toBe(true);
  });
});

describe('ConfigSyncResponse', () => {
  it('validates full sync response', () => {
    const msg = {
      type: 'config.sync.response' as const,
      tenantId: TENANT_ID,
      timestamp: Date.now(),
      connectors: [
        { type: 'slack' as const, status: 'connected' as const },
        { type: 'email' as const, status: 'disconnected' as const },
      ],
      skills: [
        { id: 'slack-triage', status: 'active' as const, config: { channels: ['general'] } },
      ],
      tools: [
        { name: 'web_search', enabled: true },
      ],
      schedules: [
        { id: 'sched_1', skillId: 'slack-triage', cron: '*/30 * * * *', enabled: true, nextRun: Date.now() + 1800000 },
      ],
    };
    expect(ConfigSyncResponse.safeParse(msg).success).toBe(true);
  });
});

describe('Discriminated unions', () => {
  it('TenantMessage discriminates by type', () => {
    const heartbeat = {
      type: 'heartbeat' as const,
      tenantId: TENANT_ID,
      timestamp: Date.now(),
      status: 'healthy' as const,
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45 },
      agent: { activeSessions: 0, queueDepth: 0 },
      system: { cpuPercent: 20, memoryUsedMB: 8000, diskUsedPercent: 35 },
    };
    expect(TenantMessage.safeParse(heartbeat).success).toBe(true);
  });

  it('DashboardMessage discriminates by type', () => {
    const cmd = {
      type: 'command' as const,
      commandId: COMMAND_ID,
      tenantId: TENANT_ID,
      action: 'agent.restart' as const,
      payload: {},
    };
    expect(DashboardMessage.safeParse(cmd).success).toBe(true);
  });
});

describe('Validation helpers', () => {
  it('validateTenantMessage returns success with data', () => {
    const heartbeat = {
      type: 'heartbeat',
      tenantId: TENANT_ID,
      timestamp: Date.now(),
      status: 'healthy',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45 },
      agent: { activeSessions: 0, queueDepth: 0 },
      system: { cpuPercent: 20, memoryUsedMB: 8000, diskUsedPercent: 35 },
    };
    const result = validateTenantMessage(heartbeat);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('heartbeat');
    }
  });

  it('validateTenantMessage returns error for invalid', () => {
    const result = validateTenantMessage({ type: 'invalid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it('validateDashboardMessage validates command', () => {
    const cmd = {
      type: 'command',
      commandId: COMMAND_ID,
      tenantId: TENANT_ID,
      action: 'memory.clear',
      payload: { category: 'all' },
    };
    const result = validateDashboardMessage(cmd);
    expect(result.success).toBe(true);
  });

  it('validateHeartbeat validates heartbeat specifically', () => {
    const result = validateHeartbeat({
      type: 'heartbeat',
      tenantId: TENANT_ID,
      timestamp: Date.now(),
      status: 'degraded',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 12 },
      agent: { activeSessions: 5, queueDepth: 3 },
      system: { cpuPercent: 95, memoryUsedMB: 22000, diskUsedPercent: 88 },
    });
    expect(result.success).toBe(true);
  });

  it('validateCommand validates command specifically', () => {
    const result = validateCommand({
      type: 'command',
      commandId: COMMAND_ID,
      tenantId: TENANT_ID,
      action: 'tool.enable',
      payload: { toolName: 'web_search' },
    });
    expect(result.success).toBe(true);
  });

  it('parseJsonMessage parses valid JSON', () => {
    const json = JSON.stringify({
      type: 'heartbeat',
      tenantId: TENANT_ID,
      timestamp: Date.now(),
      status: 'healthy',
      model: { loaded: true, name: 'muse-glimmer', inferenceSpeed: 45 },
      agent: { activeSessions: 0, queueDepth: 0 },
      system: { cpuPercent: 20, memoryUsedMB: 8000, diskUsedPercent: 35 },
    });
    const result = parseJsonMessage(json);
    expect(result.success).toBe(true);
  });

  it('parseJsonMessage rejects invalid JSON', () => {
    const result = parseJsonMessage('not json{');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Invalid JSON');
    }
  });

  it('parseJsonMessage rejects valid JSON with invalid schema', () => {
    const result = parseJsonMessage(JSON.stringify({ type: 'unknown', foo: 'bar' }));
    expect(result.success).toBe(false);
  });
});

describe('Zero-knowledge enforcement', () => {
  it('HeartbeatMessage has no content field', () => {
    const shape = HeartbeatMessage.shape;
    expect('content' in shape).toBe(false);
    expect('message' in shape).toBe(false);
    expect('text' in shape).toBe(false);
    expect('body' in shape).toBe(false);
  });

  it('SessionEventMessage has no content field', () => {
    const shape = SessionEventMessage.shape;
    expect('content' in shape).toBe(false);
    expect('message' in shape).toBe(false);
    expect('text' in shape).toBe(false);
  });

  it('MetricsMessage has no content field', () => {
    const shape = MetricsMessage.shape;
    expect('content' in shape).toBe(false);
    expect('message' in shape).toBe(false);
  });
});
