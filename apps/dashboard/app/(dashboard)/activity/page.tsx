'use client';

import { useEffect, useState, useCallback } from 'react';

interface ActivityEvent {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userId: string | null;
  createdAt: string;
}

interface PaginationInfo {
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
}

const ACTION_LABELS: Record<string, string> = {
  'user.signup': 'Account created',
  'user.login': 'Logged in',
  'user.login_failed': 'Failed login attempt',
  'user.password_reset': 'Password reset',
  'connector.connected': 'Connector connected',
  'connector.disconnected': 'Connector disconnected',
  'workflow.activated': 'Workflow activated',
  'workflow.deactivated': 'Workflow deactivated',
  'command.sent': 'Command sent to agent',
  'billing.checkout_completed': 'Subscription started',
  'billing.payment_failed': 'Payment failed',
  'provision.started': 'Instance provisioning started',
  'provision.completed': 'Instance ready',
};

const ACTION_ICONS: Record<string, string> = {
  'user.signup': '👤',
  'user.login': '🔓',
  'user.login_failed': '🚫',
  'user.password_reset': '🔑',
  'connector.connected': '🔗',
  'connector.disconnected': '⛓️‍💥',
  'workflow.activated': '▶️',
  'workflow.deactivated': '⏸️',
  'command.sent': '📡',
  'billing.checkout_completed': '💳',
  'billing.payment_failed': '⚠️',
  'provision.started': '🚀',
  'provision.completed': '✅',
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [filter, setFilter] = useState<string>('');

  const fetchEvents = useCallback(async (tid: string, cursor?: string | null, filterAction?: string) => {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    if (filterAction) params.set('action', filterAction);

    const res = await fetch(`/api/tenants/${tid}/activity?${params}`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch('/api/auth/me');
        const me = await meRes.json();
        if (!meRes.ok) return;
        setTenantId(me.tenant.id);

        const data = await fetchEvents(me.tenant.id, null, filter || undefined);
        if (data) {
          setEvents(data.items);
          setPagination(data.pagination);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter, fetchEvents]);

  async function loadMore() {
    if (!pagination?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchEvents(tenantId, pagination.nextCursor, filter || undefined);
      if (data) {
        setEvents(prev => [...prev, ...data.items]);
        setPagination(data.pagination);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Activity</h1>
        <div className="space-y-3 mt-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-border" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-border rounded w-1/3" />
                  <div className="h-3 bg-border rounded w-1/4" />
                </div>
                <div className="h-3 bg-border rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Activity</h1>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="input w-48"
        >
          <option value="">All events</option>
          <option value="user.login">Logins</option>
          <option value="user.login_failed">Failed logins</option>
          <option value="connector.connected">Connections</option>
          <option value="workflow.activated">Workflows</option>
          <option value="command.sent">Commands</option>
        </select>
      </div>
      <p className="text-muted text-sm mb-8">
        Audit log of all actions taken by your agent and team members.
      </p>

      {events.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-muted">No activity yet. Events will appear here once your agent starts working.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="card flex items-center justify-between py-3 px-5">
                <div className="flex items-center gap-3">
                  <span className="text-lg w-8 text-center">
                    {ACTION_ICONS[event.action] || '•'}
                  </span>
                  <div>
                    <div className="text-sm font-medium">
                      {ACTION_LABELS[event.action] || event.action}
                    </div>
                    <div className="text-xs text-muted">
                      {event.resource}
                      {event.resourceId && <span className="ml-1 font-mono">{event.resourceId.slice(0, 8)}</span>}
                      {event.ipAddress && <span className="ml-2">from {event.ipAddress}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted whitespace-nowrap">
                  {formatRelativeTime(event.createdAt)}
                </div>
              </div>
            ))}
          </div>

          {pagination?.hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-secondary"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
