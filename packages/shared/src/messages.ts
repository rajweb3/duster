import { z } from 'zod';

// === Enums ===

export const TenantStatus = z.enum(['healthy', 'degraded', 'error']);
export type TenantStatus = z.infer<typeof TenantStatus>;

export const SessionEventType = z.enum(['started', 'tool_called', 'completed', 'error']);
export type SessionEventType = z.infer<typeof SessionEventType>;

export const ConnectorType = z.enum(['slack', 'email', 'whatsapp', 'trello']);
export type ConnectorType = z.infer<typeof ConnectorType>;

export const ConnectorStatus = z.enum(['connected', 'disconnected', 'error']);
export type ConnectorStatus = z.infer<typeof ConnectorStatus>;

export const WorkflowStatus = z.enum(['active', 'paused', 'error', 'stopped']);
export type WorkflowStatus = z.infer<typeof WorkflowStatus>;

export const CommandAction = z.enum([
  'skill.activate',
  'skill.deactivate',
  'skill.configure',
  'connector.configure',
  'connector.disconnect',
  'memory.clear',
  'agent.restart',
  'tool.enable',
  'tool.disable',
  'schedule.set',
  'schedule.pause',
  'schedule.resume',
]);
export type CommandAction = z.infer<typeof CommandAction>;

// === Tenant → Dashboard Messages ===

export const HeartbeatMessage = z.object({
  type: z.literal('heartbeat'),
  tenantId: z.string().uuid(),
  timestamp: z.number(),
  status: TenantStatus,
  model: z.object({
    loaded: z.boolean(),
    name: z.string(),
    inferenceSpeed: z.number(),
  }),
  agent: z.object({
    activeSessions: z.number().int().min(0),
    queueDepth: z.number().int().min(0),
  }),
  system: z.object({
    cpuPercent: z.number().min(0).max(100),
    memoryUsedMB: z.number().min(0),
    diskUsedPercent: z.number().min(0).max(100),
  }),
});
export type HeartbeatMessage = z.infer<typeof HeartbeatMessage>;

export const MetricsMessage = z.object({
  type: z.literal('metrics'),
  tenantId: z.string().uuid(),
  timestamp: z.number(),
  tokensPerMinute: z.number().min(0),
  activeSessions: z.number().int().min(0),
  queueDepth: z.number().int().min(0),
  inferenceSpeedTokS: z.number().min(0),
  uptimeSeconds: z.number().min(0),
  errorRate: z.number().min(0).max(1),
});
export type MetricsMessage = z.infer<typeof MetricsMessage>;

export const SessionEventMessage = z.object({
  type: z.literal('session.event'),
  tenantId: z.string().uuid(),
  sessionId: z.string(),
  event: SessionEventType,
  timestamp: z.number(),
  metadata: z.object({
    duration: z.number().optional(),
    toolName: z.string().optional(),
    tokensUsed: z.number().int().optional(),
    skillId: z.string().optional(),
  }),
});
export type SessionEventMessage = z.infer<typeof SessionEventMessage>;

export const ConnectorStatusMessage = z.object({
  type: z.literal('connector.status'),
  tenantId: z.string().uuid(),
  connector: ConnectorType,
  status: ConnectorStatus,
  errorCode: z.string().optional(),
  lastSeen: z.number().optional(),
});
export type ConnectorStatusMessage = z.infer<typeof ConnectorStatusMessage>;

export const SkillStatusMessage = z.object({
  type: z.literal('skill.status'),
  tenantId: z.string().uuid(),
  skillId: z.string(),
  status: WorkflowStatus,
  lastRun: z.number().optional(),
  nextRun: z.number().optional(),
  runCount: z.number().int().min(0).optional(),
});
export type SkillStatusMessage = z.infer<typeof SkillStatusMessage>;

export const ToolRegistryMessage = z.object({
  type: z.literal('tool.registry'),
  tenantId: z.string().uuid(),
  tools: z.array(z.object({
    name: z.string(),
    enabled: z.boolean(),
    description: z.string().optional(),
  })),
});
export type ToolRegistryMessage = z.infer<typeof ToolRegistryMessage>;

export const MemoryStatsMessage = z.object({
  type: z.literal('memory.stats'),
  tenantId: z.string().uuid(),
  entryCount: z.number().int().min(0),
  categories: z.array(z.string()),
  lastUpdated: z.number().optional(),
});
export type MemoryStatsMessage = z.infer<typeof MemoryStatsMessage>;

// === Dashboard → Tenant Messages ===

export const CommandMessage = z.object({
  type: z.literal('command'),
  commandId: z.string().uuid(),
  tenantId: z.string().uuid(),
  action: CommandAction,
  payload: z.record(z.unknown()),
});
export type CommandMessage = z.infer<typeof CommandMessage>;

export const CommandAckMessage = z.object({
  type: z.literal('command.ack'),
  commandId: z.string().uuid(),
  tenantId: z.string().uuid(),
  success: z.boolean(),
  error: z.string().optional(),
  timestamp: z.number(),
});
export type CommandAckMessage = z.infer<typeof CommandAckMessage>;

export const ConfigSyncRequest = z.object({
  type: z.literal('config.sync.request'),
  tenantId: z.string().uuid(),
});
export type ConfigSyncRequest = z.infer<typeof ConfigSyncRequest>;

export const ConfigSyncResponse = z.object({
  type: z.literal('config.sync.response'),
  tenantId: z.string().uuid(),
  timestamp: z.number(),
  connectors: z.array(z.object({
    type: ConnectorType,
    status: ConnectorStatus,
    config: z.record(z.unknown()).optional(),
  })),
  skills: z.array(z.object({
    id: z.string(),
    status: WorkflowStatus,
    config: z.record(z.unknown()).optional(),
  })),
  tools: z.array(z.object({
    name: z.string(),
    enabled: z.boolean(),
  })),
  schedules: z.array(z.object({
    id: z.string(),
    skillId: z.string(),
    cron: z.string(),
    enabled: z.boolean(),
    nextRun: z.number().optional(),
  })),
});
export type ConfigSyncResponse = z.infer<typeof ConfigSyncResponse>;

// === Union Types ===

export const TenantMessage = z.discriminatedUnion('type', [
  HeartbeatMessage,
  MetricsMessage,
  SessionEventMessage,
  ConnectorStatusMessage,
  SkillStatusMessage,
  ToolRegistryMessage,
  MemoryStatsMessage,
  CommandAckMessage,
  ConfigSyncResponse,
]);
export type TenantMessage = z.infer<typeof TenantMessage>;

export const DashboardMessage = z.discriminatedUnion('type', [
  CommandMessage,
  ConfigSyncRequest,
]);
export type DashboardMessage = z.infer<typeof DashboardMessage>;

export const AnyMessage = z.union([TenantMessage, DashboardMessage]);
export type AnyMessage = z.infer<typeof AnyMessage>;
