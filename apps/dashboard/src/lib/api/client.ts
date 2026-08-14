import type { CommandAction } from '@duster/shared';

export interface ApiConfig {
  baseUrl: string;
  token: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

export class DashboardApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.token = config.token;
  }

  async getTenants(): Promise<ApiResponse<TenantSummary[]>> {
    return this.get('/api/tenants');
  }

  async getTenant(tenantId: string): Promise<ApiResponse<TenantSummary>> {
    return this.get(`/api/tenants/${tenantId}`);
  }

  async sendCommand(tenantId: string, action: CommandAction, payload: Record<string, unknown>): Promise<ApiResponse<CommandResult>> {
    return this.post(`/api/tenants/${tenantId}/commands`, { action, payload });
  }

  async provision(plan: ProvisionRequest): Promise<ApiResponse<ProvisionResult>> {
    return this.post('/api/provision', plan);
  }

  async getWorkflows(tenantId: string): Promise<ApiResponse<WorkflowInfo[]>> {
    return this.get(`/api/tenants/${tenantId}/workflows`);
  }

  async activateWorkflow(tenantId: string, skillId: string, config: Record<string, unknown>): Promise<ApiResponse<CommandResult>> {
    return this.sendCommand(tenantId, 'skill.activate', { skillId, config });
  }

  async deactivateWorkflow(tenantId: string, skillId: string): Promise<ApiResponse<CommandResult>> {
    return this.sendCommand(tenantId, 'skill.deactivate', { skillId });
  }

  async configureConnector(tenantId: string, connector: string, config: Record<string, unknown>): Promise<ApiResponse<CommandResult>> {
    return this.sendCommand(tenantId, 'connector.configure', { connector, config });
  }

  async disconnectConnector(tenantId: string, connector: string): Promise<ApiResponse<CommandResult>> {
    return this.sendCommand(tenantId, 'connector.disconnect', { connector });
  }

  async toggleTool(tenantId: string, toolName: string, enabled: boolean): Promise<ApiResponse<CommandResult>> {
    const action = enabled ? 'tool.enable' : 'tool.disable';
    return this.sendCommand(tenantId, action, { toolName });
  }

  async clearMemory(tenantId: string, category?: string): Promise<ApiResponse<CommandResult>> {
    return this.sendCommand(tenantId, 'memory.clear', { category: category || 'all' });
  }

  async restartAgent(tenantId: string): Promise<ApiResponse<CommandResult>> {
    return this.sendCommand(tenantId, 'agent.restart', {});
  }

  private async get<T>(path: string): Promise<ApiResponse<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: this.headers(),
      });
      return this.parseResponse(res);
    } catch (err: any) {
      return { ok: false, error: err.message, status: 0 };
    }
  }

  private async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return this.parseResponse(res);
    } catch (err: any) {
      return { ok: false, error: err.message, status: 0 };
    }
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}` };
  }

  private async parseResponse<T>(res: Response): Promise<ApiResponse<T>> {
    const status = res.status;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: text || `HTTP ${status}`, status };
    }
    const data = await res.json();
    return { ok: true, data, status };
  }
}

export interface TenantSummary {
  tenantId: string;
  status: string;
  connectedAt: number;
  lastHeartbeat: number;
  isOnline: boolean;
}

export interface CommandResult {
  sent: boolean;
  commandId: string;
  error?: string;
}

export interface ProvisionRequest {
  tenantId: string;
  plan: 'standard';
}

export interface ProvisionResult {
  success: boolean;
  instanceId?: string;
  error?: string;
}

export interface WorkflowInfo {
  id: string;
  name: string;
  description: string;
  status: string;
  category: string;
}
