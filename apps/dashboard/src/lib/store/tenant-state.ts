import type {
  TenantStatus,
  ConnectorType,
  ConnectorStatus,
  WorkflowStatus,
  HeartbeatMessage,
  MetricsMessage,
  SessionEventMessage,
  ConnectorStatusMessage,
  SkillStatusMessage,
  ToolRegistryMessage,
  MemoryStatsMessage,
  TenantMessage,
} from '@duster/shared';

export interface ConnectorState {
  type: ConnectorType;
  status: ConnectorStatus;
  errorCode?: string;
  lastSeen?: number;
}

export interface SkillState {
  id: string;
  status: WorkflowStatus;
  lastRun?: number;
  nextRun?: number;
  runCount?: number;
}

export interface ToolState {
  name: string;
  enabled: boolean;
  description?: string;
}

export interface SessionState {
  sessionId: string;
  event: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface TenantDashboardState {
  tenantId: string;
  status: TenantStatus;
  lastHeartbeat: number;
  connected: boolean;

  model: {
    loaded: boolean;
    name: string;
    inferenceSpeed: number;
  };

  agent: {
    activeSessions: number;
    queueDepth: number;
  };

  system: {
    cpuPercent: number;
    memoryUsedMB: number;
    diskUsedPercent: number;
  };

  metrics: {
    tokensPerMinute: number;
    uptimeSeconds: number;
    errorRate: number;
  };

  connectors: ConnectorState[];
  skills: SkillState[];
  tools: ToolState[];
  sessions: SessionState[];
  memoryStats: { entryCount: number; categories: string[] };
}

export function createInitialState(tenantId: string): TenantDashboardState {
  return {
    tenantId,
    status: 'healthy',
    lastHeartbeat: 0,
    connected: false,
    model: { loaded: false, name: 'muse-glimmer', inferenceSpeed: 0 },
    agent: { activeSessions: 0, queueDepth: 0 },
    system: { cpuPercent: 0, memoryUsedMB: 0, diskUsedPercent: 0 },
    metrics: { tokensPerMinute: 0, uptimeSeconds: 0, errorRate: 0 },
    connectors: [],
    skills: [],
    tools: [],
    sessions: [],
    memoryStats: { entryCount: 0, categories: [] },
  };
}

export function applyMessage(state: TenantDashboardState, message: TenantMessage): TenantDashboardState {
  const next = { ...state };

  switch (message.type) {
    case 'heartbeat': {
      const m = message as HeartbeatMessage;
      next.status = m.status;
      next.lastHeartbeat = m.timestamp;
      next.connected = true;
      next.model = { ...m.model };
      next.agent = { ...m.agent };
      next.system = { ...m.system };
      break;
    }
    case 'metrics': {
      const m = message as MetricsMessage;
      next.metrics = {
        tokensPerMinute: m.tokensPerMinute,
        uptimeSeconds: m.uptimeSeconds,
        errorRate: m.errorRate,
      };
      next.agent = { activeSessions: m.activeSessions, queueDepth: m.queueDepth };
      break;
    }
    case 'session.event': {
      const m = message as SessionEventMessage;
      const session: SessionState = {
        sessionId: m.sessionId,
        event: m.event,
        timestamp: m.timestamp,
        metadata: m.metadata as Record<string, unknown>,
      };
      next.sessions = [session, ...state.sessions].slice(0, 100);
      break;
    }
    case 'connector.status': {
      const m = message as ConnectorStatusMessage;
      const idx = next.connectors.findIndex(c => c.type === m.connector);
      const conn: ConnectorState = {
        type: m.connector,
        status: m.status,
        errorCode: m.errorCode,
        lastSeen: m.lastSeen,
      };
      if (idx >= 0) {
        next.connectors = [...state.connectors];
        next.connectors[idx] = conn;
      } else {
        next.connectors = [...state.connectors, conn];
      }
      break;
    }
    case 'skill.status': {
      const m = message as SkillStatusMessage;
      const idx = next.skills.findIndex(s => s.id === m.skillId);
      const skill: SkillState = {
        id: m.skillId,
        status: m.status,
        lastRun: m.lastRun,
        nextRun: m.nextRun,
        runCount: m.runCount,
      };
      if (idx >= 0) {
        next.skills = [...state.skills];
        next.skills[idx] = skill;
      } else {
        next.skills = [...state.skills, skill];
      }
      break;
    }
    case 'tool.registry': {
      const m = message as ToolRegistryMessage;
      next.tools = m.tools.map(t => ({ name: t.name, enabled: t.enabled, description: t.description }));
      break;
    }
    case 'memory.stats': {
      const m = message as MemoryStatsMessage;
      next.memoryStats = { entryCount: m.entryCount, categories: m.categories };
      break;
    }
  }

  return next;
}
