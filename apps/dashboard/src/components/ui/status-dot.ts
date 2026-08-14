import type { TenantStatus, ConnectorStatus, WorkflowStatus } from '@duster/shared';

export type StatusVariant = 'healthy' | 'degraded' | 'error' | 'connected' | 'disconnected' | 'active' | 'paused' | 'stopped' | 'offline';

export interface StatusDotProps {
  status: StatusVariant;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  label?: string;
}

const COLOR_MAP: Record<StatusVariant, string> = {
  healthy: '#22c55e',
  connected: '#22c55e',
  active: '#22c55e',
  degraded: '#eab308',
  paused: '#eab308',
  error: '#ef4444',
  disconnected: '#ef4444',
  stopped: '#555555',
  offline: '#555555',
};

const SIZE_MAP = { sm: 8, md: 10, lg: 12 };

export function getStatusColor(status: StatusVariant): string {
  return COLOR_MAP[status] || '#555555';
}

export function getStatusSize(size: 'sm' | 'md' | 'lg' = 'md'): number {
  return SIZE_MAP[size];
}

export function mapTenantStatus(status: TenantStatus): StatusVariant {
  return status;
}

export function mapConnectorStatus(status: ConnectorStatus): StatusVariant {
  return status;
}

export function mapWorkflowStatus(status: WorkflowStatus): StatusVariant {
  switch (status) {
    case 'active': return 'active';
    case 'paused': return 'paused';
    case 'error': return 'error';
    case 'stopped': return 'stopped';
    default: return 'offline';
  }
}

export function getStatusLabel(status: StatusVariant): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
