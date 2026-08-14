'use client';

import { useEffect, useState } from 'react';

const CATALOG = [
  { id: 'slack-triage', name: 'Slack Triage', description: 'Categorize and route incoming Slack messages', category: 'communication', icon: '💬' },
  { id: 'email-assistant', name: 'Email Assistant', description: 'Draft responses, categorize by priority, flag for review', category: 'communication', icon: '📧' },
  { id: 'daily-digest', name: 'Daily Digest', description: 'Daily summary of activity, deadlines, and metrics', category: 'productivity', icon: '📰' },
  { id: 'task-creator', name: 'Task Creator', description: 'Extract action items and create tasks automatically', category: 'productivity', icon: '✓' },
  { id: 'meeting-notes', name: 'Meeting Notes', description: 'Summarize transcripts and extract action items', category: 'operations', icon: '🎤' },
];

interface Workflow {
  id: string;
  skillId: string;
  name: string;
  status: string;
  runCount: number;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const meRes = await fetch('/api/auth/me');
      const me = await meRes.json();
      setTenantId(me.tenant.id);

      const res = await fetch(`/api/tenants/${me.tenant.id}/workflows`);
      const data = await res.json();
      setWorkflows(data);
      setLoading(false);
    }
    load();
  }, []);

  async function activateWorkflow(skillId: string, name: string) {
    setActivating(skillId);
    const res = await fetch(`/api/tenants/${tenantId}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId, name, config: {} }),
    });

    if (res.ok) {
      const workflow = await res.json();
      setWorkflows(prev => [...prev, workflow]);

      // Send activate command to sidecar
      await fetch(`/api/tenants/${tenantId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skill.activate', payload: { skillId, config: {} } }),
      });
    }
    setActivating(null);
  }

  async function deactivateWorkflow(skillId: string) {
    await fetch(`/api/tenants/${tenantId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skill.deactivate', payload: { skillId } }),
    });
    setWorkflows(prev => prev.filter(w => w.skillId !== skillId));
  }

  if (loading) return <div className="text-muted">Loading...</div>;

  const activeSkillIds = new Set(workflows.map(w => w.skillId));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Workflows</h1>
      <p className="text-muted text-sm mb-8">
        Activate AI workflows that run autonomously on your instance.
      </p>

      {/* Active workflows */}
      {workflows.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Active</h2>
          <div className="space-y-3">
            {workflows.map((w) => (
              <div key={w.id} className="card flex items-center justify-between">
                <div>
                  <div className="font-medium">{w.name}</div>
                  <div className="text-xs text-muted">{w.runCount} runs · {w.status}</div>
                </div>
                <button
                  onClick={() => deactivateWorkflow(w.skillId)}
                  className="btn-secondary text-xs px-2 py-1"
                >
                  Deactivate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catalog */}
      <h2 className="text-lg font-semibold mb-4">Available Workflows</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATALOG.filter(c => !activeSkillIds.has(c.id)).map((item) => (
          <div key={item.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted mt-0.5">{item.category}</div>
                </div>
              </div>
              <button
                onClick={() => activateWorkflow(item.id, item.name)}
                disabled={activating === item.id}
                className="btn-primary text-xs px-3 py-1"
              >
                {activating === item.id ? 'Activating...' : 'Activate'}
              </button>
            </div>
            <p className="text-sm text-muted mt-3">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
