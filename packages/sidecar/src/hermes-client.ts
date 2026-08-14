import type {
  TenantStatus,
  ConnectorType,
  ConnectorStatus,
  WorkflowStatus,
} from '@duster/shared';

export interface HermesHealth {
  status: TenantStatus;
  model: { loaded: boolean; name: string; inferenceSpeed: number };
  agent: { activeSessions: number; queueDepth: number };
}

export interface HermesConnectorInfo {
  type: ConnectorType;
  status: ConnectorStatus;
  errorCode?: string;
}

export interface HermesSkillInfo {
  id: string;
  status: WorkflowStatus;
  lastRun?: number;
  nextRun?: number;
  runCount?: number;
  config?: Record<string, unknown>;
}

export interface HermesToolInfo {
  name: string;
  enabled: boolean;
  description?: string;
}

export interface HermesMemoryStats {
  entryCount: number;
  categories: string[];
  lastUpdated?: number;
}

export interface HermesSessionEvent {
  sessionId: string;
  event: 'started' | 'tool_called' | 'completed' | 'error';
  metadata: {
    duration?: number;
    toolName?: string;
    tokensUsed?: number;
    skillId?: string;
  };
}

export class HermesClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async getHealth(): Promise<HermesHealth> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) {
      return {
        status: 'error',
        model: { loaded: false, name: 'muse-glimmer', inferenceSpeed: 0 },
        agent: { activeSessions: 0, queueDepth: 0 },
      };
    }
    return res.json();
  }

  async getConnectors(): Promise<HermesConnectorInfo[]> {
    const res = await fetch(`${this.baseUrl}/connectors`);
    if (!res.ok) return [];
    return res.json();
  }

  async getSkills(): Promise<HermesSkillInfo[]> {
    const res = await fetch(`${this.baseUrl}/skills`);
    if (!res.ok) return [];
    return res.json();
  }

  async getTools(): Promise<HermesToolInfo[]> {
    const res = await fetch(`${this.baseUrl}/tools`);
    if (!res.ok) return [];
    return res.json();
  }

  async getMemoryStats(): Promise<HermesMemoryStats> {
    const res = await fetch(`${this.baseUrl}/memory/stats`);
    if (!res.ok) return { entryCount: 0, categories: [] };
    return res.json();
  }

  async executeCommand(action: string, payload: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${this.baseUrl}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) {
      return { success: false, error: `Hermes returned ${res.status}` };
    }
    return res.json();
  }

  async getSystemMetrics(): Promise<{ cpuPercent: number; memoryUsedMB: number; diskUsedPercent: number }> {
    const res = await fetch(`${this.baseUrl}/system/metrics`);
    if (!res.ok) {
      return { cpuPercent: 0, memoryUsedMB: 0, diskUsedPercent: 0 };
    }
    return res.json();
  }
}
