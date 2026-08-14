'use client';

import { useEffect, useState, useCallback } from 'react';

// --- Types ---

interface Schedule {
  id: string;
  skillId: string;
  name: string;
  cron: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'error' | null;
  lastRunError: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

interface Workflow {
  id: string;
  skillId: string;
  name: string;
  status: string;
  runCount: number;
}

// --- Constants ---

const CRON_PRESETS = [
  { label: 'Every 30 min', cron: '*/30 * * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Weekdays at 9am', cron: '0 9 * * 1-5' },
  { label: 'Weekly Monday 9am', cron: '0 9 * * 1' },
];

const CRON_LABELS: Record<string, string> = {
  '*/30 * * * *': 'Every 30 minutes',
  '0 * * * *': 'Every hour',
  '0 9 * * *': 'Every day at 9:00 AM',
  '0 9 * * 1-5': 'Weekdays at 9:00 AM',
  '0 9 * * 1': 'Every Monday at 9:00 AM',
  '*/15 * * * *': 'Every 15 minutes',
  '*/5 * * * *': 'Every 5 minutes',
  '0 */2 * * *': 'Every 2 hours',
  '0 */6 * * *': 'Every 6 hours',
  '0 0 * * *': 'Every day at midnight',
  '0 12 * * *': 'Every day at noon',
  '0 9 * * 0': 'Every Sunday at 9:00 AM',
};

// --- Utilities ---

function cronToHuman(cron: string): string {
  if (CRON_LABELS[cron]) return CRON_LABELS[cron];

  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Handle common patterns
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every ${minute.slice(2)} minutes`;
  }
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const h = parseInt(hour);
    const m = parseInt(minute);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Every day at ${displayH}:${m.toString().padStart(2, '0')} ${period}`;
  }
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const h = parseInt(hour);
    const m = parseInt(minute);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const days = dayOfWeek === '1-5' ? 'Weekdays' : `Day ${dayOfWeek}`;
    return `${days} at ${displayH}:${m.toString().padStart(2, '0')} ${period}`;
  }

  return cron;
}

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

function formatFutureTime(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'in < 1 min';
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

function getUpcomingRuns(schedules: Schedule[], count: number = 8): { time: string; name: string; id: string }[] {
  const runs: { time: string; name: string; id: string }[] = [];

  for (const schedule of schedules) {
    if (!schedule.enabled || !schedule.nextRunAt) continue;
    runs.push({ time: schedule.nextRunAt, name: schedule.name, id: schedule.id });

    // Estimate next few runs based on cron frequency
    const nextTime = new Date(schedule.nextRunAt).getTime();
    const intervalMs = estimateIntervalMs(schedule.cron);
    if (intervalMs > 0) {
      for (let i = 1; i < 4; i++) {
        const futureTime = new Date(nextTime + intervalMs * i).toISOString();
        runs.push({ time: futureTime, name: schedule.name, id: `${schedule.id}-${i}` });
      }
    }
  }

  return runs
    .filter(r => new Date(r.time).getTime() > Date.now())
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .slice(0, count);
}

function estimateIntervalMs(cron: string): number {
  const parts = cron.split(' ');
  if (parts.length !== 5) return 0;
  const [minute, hour, , , dayOfWeek] = parts;

  if (minute.startsWith('*/')) return parseInt(minute.slice(2)) * 60000;
  if (hour.startsWith('*/')) return parseInt(hour.slice(2)) * 3600000;
  if (hour !== '*' && dayOfWeek === '*') return 86400000; // daily
  if (dayOfWeek === '1-5') return 86400000; // weekdays (approximate)
  if (dayOfWeek !== '*') return 604800000; // weekly
  return 86400000; // fallback daily
}

// --- Component ---

export default function AutomationsPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ skillId: '', cron: '', customCron: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async (tid: string) => {
    const res = await fetch(`/api/tenants/${tid}/automations`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
    return [];
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch('/api/auth/me');
        const me = await meRes.json();
        if (!meRes.ok || !me.tenant) return;
        setTenantId(me.tenant.id);

        const [schedulesData, workflowsRes] = await Promise.all([
          fetchSchedules(me.tenant.id),
          fetch(`/api/tenants/${me.tenant.id}/workflows`),
        ]);

        setSchedules(schedulesData);

        if (workflowsRes.ok) {
          const wfData = await workflowsRes.json();
          setWorkflows(wfData);
        }
      } catch {
        setError('Failed to load automations');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchSchedules]);

  async function toggleSchedule(scheduleId: string, currentlyEnabled: boolean) {
    setActionLoading(scheduleId);
    try {
      const action = currentlyEnabled ? 'schedule.pause' : 'schedule.resume';
      const res = await fetch(`/api/tenants/${tenantId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload: { scheduleId } }),
      });

      if (res.ok) {
        setSchedules(prev =>
          prev.map(s =>
            s.id === scheduleId ? { ...s, enabled: !currentlyEnabled } : s
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteSchedule(scheduleId: string) {
    if (!confirm('Remove this automation? The workflow will no longer run on this schedule.')) return;
    setActionLoading(scheduleId);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/automations/${scheduleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSchedules(prev => prev.filter(s => s.id !== scheduleId));
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function createSchedule() {
    const cron = createForm.cron === 'custom' ? createForm.customCron : createForm.cron;
    if (!createForm.skillId || !cron) return;

    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: createForm.skillId, cron, enabled: true }),
      });

      if (res.ok) {
        const newSchedule = await res.json();
        setSchedules(prev => [...prev, newSchedule]);
        setShowCreateForm(false);
        setCreateForm({ skillId: '', cron: '', customCron: '' });
      } else {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || 'Failed to create automation');
      }
    } catch {
      setError('Failed to create automation');
    } finally {
      setCreating(false);
    }
  }

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Automations</h1>
        <p className="text-muted text-sm mb-8">Set recurring workflows on a schedule.</p>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-border rounded w-1/3" />
                  <div className="h-3 bg-border rounded w-1/2" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-6 w-16 bg-border rounded" />
                  <div className="h-8 w-20 bg-border rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <div className="h-5 bg-border rounded w-40 mb-4 animate-pulse" />
          <div className="card animate-pulse">
            <div className="space-y-3">
              <div className="h-3 bg-border rounded w-full" />
              <div className="h-3 bg-border rounded w-3/4" />
              <div className="h-3 bg-border rounded w-1/2" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const upcomingRuns = getUpcomingRuns(schedules);
  const activeCount = schedules.filter(s => s.enabled).length;
  const pausedCount = schedules.filter(s => !s.enabled).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Automations</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn-primary text-sm"
          disabled={workflows.length === 0}
        >
          + New Schedule
        </button>
      </div>
      <p className="text-muted text-sm mb-8">
        Set recurring workflows that run automatically on a schedule.
      </p>

      {/* Summary stats */}
      {schedules.length > 0 && (
        <div className="flex items-center gap-4 mb-6">
          <span className="text-sm">
            <span className="font-medium">{schedules.length}</span>
            <span className="text-muted ml-1">{schedules.length === 1 ? 'schedule' : 'schedules'}</span>
          </span>
          <span className="text-border">|</span>
          <span className="text-sm">
            <span className="text-status-green font-medium">{activeCount}</span>
            <span className="text-muted ml-1">active</span>
          </span>
          {pausedCount > 0 && (
            <>
              <span className="text-border">|</span>
              <span className="text-sm">
                <span className="text-status-yellow font-medium">{pausedCount}</span>
                <span className="text-muted ml-1">paused</span>
              </span>
            </>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="card border-status-red/30 bg-status-red/5 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-status-red">{error}</span>
            <button onClick={() => setError(null)} className="text-muted hover:text-foreground text-xs">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create form modal */}
      {showCreateForm && (
        <div className="card mb-6 border-foreground/20">
          <h3 className="font-semibold mb-4">Create New Schedule</h3>
          <div className="space-y-4">
            {/* Workflow select */}
            <div>
              <label className="text-sm text-muted block mb-1">Workflow</label>
              <select
                value={createForm.skillId}
                onChange={(e) => setCreateForm(prev => ({ ...prev, skillId: e.target.value }))}
                className="input w-full"
              >
                <option value="">Select a workflow...</option>
                {workflows.map((wf) => (
                  <option key={wf.id} value={wf.skillId}>
                    {wf.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Cron presets */}
            <div>
              <label className="text-sm text-muted block mb-1">Schedule</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.cron}
                    onClick={() => setCreateForm(prev => ({ ...prev, cron: preset.cron }))}
                    className={`text-xs px-3 py-2 rounded border transition-colors ${
                      createForm.cron === preset.cron
                        ? 'border-foreground bg-surface text-foreground'
                        : 'border-border text-muted hover:border-foreground/50 hover:text-foreground'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={() => setCreateForm(prev => ({ ...prev, cron: 'custom' }))}
                  className={`text-xs px-3 py-2 rounded border transition-colors ${
                    createForm.cron === 'custom'
                      ? 'border-foreground bg-surface text-foreground'
                      : 'border-border text-muted hover:border-foreground/50 hover:text-foreground'
                  }`}
                >
                  Custom...
                </button>
              </div>

              {/* Custom cron input */}
              {createForm.cron === 'custom' && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={createForm.customCron}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, customCron: e.target.value }))}
                    placeholder="*/15 * * * *"
                    className="input w-full font-mono text-sm"
                  />
                  <p className="text-xs text-muted mt-1">
                    Standard cron format: minute hour day-of-month month day-of-week
                  </p>
                </div>
              )}

              {/* Preview */}
              {createForm.cron && createForm.cron !== 'custom' && (
                <p className="text-xs text-muted mt-1">
                  Runs: {cronToHuman(createForm.cron)}
                </p>
              )}
              {createForm.cron === 'custom' && createForm.customCron && (
                <p className="text-xs text-muted mt-1">
                  Runs: {cronToHuman(createForm.customCron)}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={createSchedule}
                disabled={creating || !createForm.skillId || (!createForm.cron || (createForm.cron === 'custom' && !createForm.customCron))}
                className="btn-primary text-sm"
              >
                {creating ? 'Creating...' : 'Create Schedule'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateForm({ skillId: '', cron: '', customCron: '' });
                  setError(null);
                }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule list */}
      {schedules.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">⏱</div>
          <p className="text-muted mb-2">No automations configured yet.</p>
          <p className="text-muted text-xs">
            Create a schedule to run your workflows automatically at set intervals.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Name and status */}
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{schedule.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      schedule.enabled ? 'badge-green' : 'badge-yellow'
                    }`}>
                      {schedule.enabled ? 'Active' : 'Paused'}
                    </span>
                  </div>

                  {/* Cron expression */}
                  <div className="text-sm text-muted mt-1">
                    <span className="font-mono text-xs bg-surface px-1.5 py-0.5 rounded">
                      {schedule.cron}
                    </span>
                    <span className="ml-2">{cronToHuman(schedule.cron)}</span>
                  </div>

                  {/* Last run + Next run */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted">
                    {schedule.lastRunAt && (
                      <span className="flex items-center gap-1">
                        Last run: {formatRelativeTime(schedule.lastRunAt)}
                        {schedule.lastRunStatus === 'success' && (
                          <span className="text-status-green">success</span>
                        )}
                        {schedule.lastRunStatus === 'error' && (
                          <span className="text-status-red" title={schedule.lastRunError || undefined}>
                            error
                          </span>
                        )}
                      </span>
                    )}
                    {!schedule.lastRunAt && (
                      <span>Never run</span>
                    )}
                    {schedule.nextRunAt && schedule.enabled && (
                      <span>
                        Next: {formatFutureTime(schedule.nextRunAt)}
                        <span className="ml-1 text-muted/70">
                          ({new Date(schedule.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => toggleSchedule(schedule.id, schedule.enabled)}
                    disabled={actionLoading === schedule.id}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    {actionLoading === schedule.id
                      ? '...'
                      : schedule.enabled
                        ? 'Pause'
                        : 'Resume'}
                  </button>
                  <button
                    onClick={() => deleteSchedule(schedule.id)}
                    disabled={actionLoading === schedule.id}
                    className="btn-danger text-xs px-3 py-1.5"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming runs timeline */}
      {upcomingRuns.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Upcoming Runs</h2>
          <div className="card">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

              {/* Timeline items */}
              <div className="space-y-4">
                {upcomingRuns.map((run, index) => {
                  const runTime = new Date(run.time);
                  const isImminent = runTime.getTime() - Date.now() < 3600000; // within 1 hour
                  return (
                    <div key={run.id} className="flex items-start gap-3 relative">
                      {/* Dot */}
                      <div className={`w-[15px] h-[15px] rounded-full border-2 shrink-0 mt-0.5 ${
                        index === 0 && isImminent
                          ? 'border-foreground bg-foreground'
                          : 'border-border bg-background'
                      }`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{run.name}</span>
                          <span className={`text-xs whitespace-nowrap ${
                            isImminent ? 'text-foreground font-medium' : 'text-muted'
                          }`}>
                            {formatFutureTime(run.time)}
                          </span>
                        </div>
                        <div className="text-xs text-muted">
                          {runTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                          {' '}at{' '}
                          {runTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state for no workflows */}
      {workflows.length === 0 && schedules.length === 0 && (
        <div className="card text-center py-8 mt-6">
          <p className="text-muted text-sm">
            No workflows available. Activate a workflow first, then you can schedule it to run automatically.
          </p>
        </div>
      )}
    </div>
  );
}
