'use client';

import { useEffect, useState, useCallback } from 'react';

// --- Types ---

interface MemoryCategory {
  name: string;
  label: string;
  description: string;
  entryCount: number;
  lastUpdated: string | null;
  growthRate: number; // entries per day over last 7 days
}

interface MemoryHealth {
  totalEntries: number;
  lastUpdated: string | null;
  status: 'healthy' | 'growing-fast' | 'stale' | 'empty';
  staleDays: number | null;
  dailyGrowthRate: number;
}

interface MemoryOverview {
  health: MemoryHealth;
  categories: MemoryCategory[];
}

// --- Helpers ---

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
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

function getHealthStatus(health: MemoryHealth): { label: string; color: string; description: string } {
  switch (health.status) {
    case 'healthy':
      return { label: 'Healthy', color: 'text-status-green', description: 'Memory is within normal parameters.' };
    case 'growing-fast':
      return { label: 'Growing Fast', color: 'text-status-yellow', description: `Adding ~${health.dailyGrowthRate} entries/day. Consider reviewing learned patterns.` };
    case 'stale':
      return { label: 'Stale', color: 'text-status-yellow', description: `No updates in ${health.staleDays} days. Agent may not be learning.` };
    case 'empty':
      return { label: 'Empty', color: 'text-muted', description: 'No memory entries yet. The agent will learn as it works.' };
  }
}

function getCategoryIcon(name: string): string {
  const icons: Record<string, string> = {
    'user_preferences': '○',
    'workflow_patterns': '◇',
    'communication_style': '◈',
    'domain_knowledge': '□',
    'task_history': '△',
    'corrections': '▽',
    'integrations': '◎',
  };
  return icons[name] || '•';
}

// --- Mock data for initial load before sidecar reports ---

const MOCK_CATEGORIES: MemoryCategory[] = [
  { name: 'user_preferences', label: 'User Preferences', description: 'Personal settings, schedules, and work patterns', entryCount: 24, lastUpdated: new Date(Date.now() - 3600000).toISOString(), growthRate: 1.2 },
  { name: 'workflow_patterns', label: 'Workflow Patterns', description: 'Learned automation sequences and decision trees', entryCount: 67, lastUpdated: new Date(Date.now() - 7200000).toISOString(), growthRate: 4.8 },
  { name: 'communication_style', label: 'Communication Style', description: 'Tone, formality, and response patterns', entryCount: 15, lastUpdated: new Date(Date.now() - 86400000).toISOString(), growthRate: 0.5 },
  { name: 'domain_knowledge', label: 'Domain Knowledge', description: 'Business context, terminology, and processes', entryCount: 42, lastUpdated: new Date(Date.now() - 14400000).toISOString(), growthRate: 2.1 },
  { name: 'task_history', label: 'Task History', description: 'Completed task patterns and outcomes', entryCount: 156, lastUpdated: new Date(Date.now() - 1800000).toISOString(), growthRate: 8.3 },
  { name: 'corrections', label: 'Corrections', description: 'User-provided corrections and overrides', entryCount: 8, lastUpdated: new Date(Date.now() - 172800000).toISOString(), growthRate: 0.3 },
];

// --- Component ---

export default function KnowledgePage() {
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    category: string | null;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', category: null, onConfirm: () => {} });

  const fetchMemoryOverview = useCallback(async (tid: string) => {
    try {
      const res = await fetch(`/api/tenants/${tid}/memory`);
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
        return;
      }
    } catch {
      // Fall through to mock data
    }

    // Use mock data if endpoint not available yet
    const totalEntries = MOCK_CATEGORIES.reduce((sum, c) => sum + c.entryCount, 0);
    const lastUpdated = MOCK_CATEGORIES
      .map(c => c.lastUpdated)
      .filter(Boolean)
      .sort()
      .pop() || null;
    const dailyGrowthRate = MOCK_CATEGORIES.reduce((sum, c) => sum + c.growthRate, 0);

    let status: MemoryHealth['status'] = 'healthy';
    if (totalEntries === 0) status = 'empty';
    else if (dailyGrowthRate > 15) status = 'growing-fast';
    else if (lastUpdated) {
      const daysSinceUpdate = (Date.now() - new Date(lastUpdated).getTime()) / 86400000;
      if (daysSinceUpdate > 7) status = 'stale';
    }

    const staleDays = lastUpdated
      ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 86400000)
      : null;

    setOverview({
      health: { totalEntries, lastUpdated, status, staleDays, dailyGrowthRate },
      categories: MOCK_CATEGORIES,
    });
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch('/api/auth/me');
        const me = await meRes.json();
        if (meRes.ok && me.tenant) {
          setTenantId(me.tenant.id);
          await fetchMemoryOverview(me.tenant.id);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [fetchMemoryOverview]);

  async function sendClearCommand(category: string | null) {
    if (!tenantId) return;
    const actionKey = category || 'all';
    setActionLoading(actionKey);
    try {
      await fetch(`/api/tenants/${tenantId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'memory.clear',
          payload: category ? { category } : {},
        }),
      });

      // Optimistic update
      if (overview) {
        if (category) {
          setOverview({
            ...overview,
            categories: overview.categories.map(c =>
              c.name === category ? { ...c, entryCount: 0, lastUpdated: new Date().toISOString() } : c
            ),
            health: {
              ...overview.health,
              totalEntries: overview.health.totalEntries - (overview.categories.find(c => c.name === category)?.entryCount || 0),
              lastUpdated: new Date().toISOString(),
            },
          });
        } else {
          setOverview({
            ...overview,
            categories: overview.categories.map(c => ({ ...c, entryCount: 0 })),
            health: { ...overview.health, totalEntries: 0, status: 'empty', lastUpdated: new Date().toISOString() },
          });
        }
      }
    } catch {
      // ignore - command delivery is best-effort
    } finally {
      setTimeout(() => setActionLoading(null), 1000);
    }
  }

  function openConfirmDialog(category: string | null) {
    const categoryLabel = category
      ? overview?.categories.find(c => c.name === category)?.label || category
      : 'All Categories';
    const entryCount = category
      ? overview?.categories.find(c => c.name === category)?.entryCount || 0
      : overview?.health.totalEntries || 0;

    setConfirmDialog({
      open: true,
      title: category ? `Clear ${categoryLabel}` : 'Clear All Memory',
      message: category
        ? `This will permanently delete ${entryCount} entries from "${categoryLabel}". The agent will lose all learned patterns in this category. This cannot be undone.`
        : `This will permanently delete all ${entryCount} memory entries across every category. The agent will start learning from scratch. This cannot be undone.`,
      category,
      onConfirm: () => {
        sendClearCommand(category);
        setConfirmDialog(prev => ({ ...prev, open: false }));
      },
    });
  }

  // Filter categories by search
  const filteredCategories = overview?.categories.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.label.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q)
    );
  }) || [];

  // --- Render: Loading skeleton ---

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Knowledge</h1>
        <p className="text-muted text-sm mb-8">Manage your agent&apos;s memory and learned patterns.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 bg-border rounded w-1/3 mb-3" />
              <div className="h-7 bg-border rounded w-1/2 mb-2" />
              <div className="h-3 bg-border rounded w-2/3" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded bg-border" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-border rounded w-1/4" />
                  <div className="h-3 bg-border rounded w-1/3" />
                </div>
                <div className="h-8 bg-border rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Knowledge</h1>
        <div className="card text-center py-12">
          <p className="text-muted">Unable to load memory data. Ensure your instance is running.</p>
        </div>
      </div>
    );
  }

  const healthInfo = getHealthStatus(overview.health);

  // --- Render: Main ---

  return (
    <div>
      {/* Confirmation Dialog */}
      {confirmDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
          />
          <div className="relative bg-surface border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-muted mb-6">{confirmDialog.message}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="btn-danger"
              >
                Clear Memory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Knowledge</h1>
        <button
          onClick={() => openConfirmDialog(null)}
          disabled={!!actionLoading || overview.health.totalEntries === 0}
          className="btn-danger"
        >
          {actionLoading === 'all' ? 'Clearing...' : 'Clear All Memory'}
        </button>
      </div>
      <p className="text-muted text-sm mb-8">
        Manage your agent&apos;s memory and learned patterns. Content is accessible only via encrypted channel.
      </p>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Total entries */}
        <div className="card">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-1">Total Entries</h3>
          <div className="text-2xl font-bold">{overview.health.totalEntries.toLocaleString()}</div>
          <div className="text-xs text-muted mt-1">
            Across {overview.categories.length} categories
          </div>
        </div>

        {/* Last updated */}
        <div className="card">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-1">Last Updated</h3>
          <div className="text-2xl font-bold">{formatRelativeTime(overview.health.lastUpdated)}</div>
          <div className="text-xs text-muted mt-1">
            {overview.health.lastUpdated
              ? new Date(overview.health.lastUpdated).toLocaleString()
              : 'No updates recorded'}
          </div>
        </div>

        {/* Health status */}
        <div className="card">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-1">Memory Health</h3>
          <div className={`text-2xl font-bold ${healthInfo.color}`}>{healthInfo.label}</div>
          <div className="text-xs text-muted mt-1">{healthInfo.description}</div>
        </div>
      </div>

      {/* Growth indicator */}
      {overview.health.status === 'growing-fast' && (
        <div className="card mb-6 border-status-yellow/30">
          <div className="flex items-start gap-3">
            <span className="text-status-yellow text-lg">!</span>
            <div>
              <p className="text-sm font-medium">Memory is growing rapidly</p>
              <p className="text-xs text-muted mt-1">
                Your agent is adding ~{overview.health.dailyGrowthRate.toFixed(1)} entries per day.
                Consider reviewing learned patterns below and clearing categories that seem noisy.
              </p>
            </div>
          </div>
        </div>
      )}

      {overview.health.status === 'stale' && (
        <div className="card mb-6 border-status-yellow/30">
          <div className="flex items-start gap-3">
            <span className="text-status-yellow text-lg">!</span>
            <div>
              <p className="text-sm font-medium">Memory appears stale</p>
              <p className="text-xs text-muted mt-1">
                No new entries in {overview.health.staleDays} days. Check that your agent is running
                and has active workflows to learn from.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search and filter */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search categories..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input w-full md:w-72"
        />
      </div>

      {/* Categories list */}
      <div className="space-y-3">
        {filteredCategories.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-muted text-sm">
              {searchQuery ? 'No categories match your search.' : 'No memory categories found.'}
            </p>
          </div>
        ) : (
          filteredCategories.map((category) => {
            const isClearing = actionLoading === category.name;
            const growthBadge = category.growthRate > 5
              ? 'badge-red'
              : category.growthRate > 2
                ? 'badge-yellow'
                : 'badge-green';

            return (
              <div key={category.name} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg w-8 text-center text-muted flex-shrink-0">
                      {getCategoryIcon(category.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{category.label}</span>
                        <span className="text-xs font-mono text-muted">
                          {category.entryCount} {category.entryCount === 1 ? 'entry' : 'entries'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${growthBadge}`}>
                          {category.growthRate.toFixed(1)}/day
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5 truncate">
                        {category.description}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        Updated {formatRelativeTime(category.lastUpdated)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={() => openConfirmDialog(category.name)}
                      disabled={!!actionLoading || category.entryCount === 0}
                      className={`btn-secondary text-xs ${isClearing ? 'opacity-50' : ''}`}
                    >
                      {isClearing ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Encryption notice */}
      <div className="mt-8 text-center">
        <p className="text-xs text-muted">
          Memory content is encrypted end-to-end between your dashboard and VM.
          Entry counts and categories are reported by the sidecar agent.
        </p>
      </div>
    </div>
  );
}
