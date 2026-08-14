'use client';

import { useState, useEffect } from 'react';

interface AgentTool {
  name: string;
  label: string;
  description: string;
  category: 'information' | 'action' | 'communication';
  risk: 'low' | 'medium' | 'high';
  defaultEnabled: boolean;
}

const AGENT_TOOLS: AgentTool[] = [
  { name: 'web_search', label: 'Web Search', description: 'Search the internet for current information', category: 'information', risk: 'low', defaultEnabled: true },
  { name: 'code_execution', label: 'Code Execution', description: 'Execute code in a sandboxed environment on the instance', category: 'action', risk: 'medium', defaultEnabled: true },
  { name: 'file_read', label: 'File Read', description: 'Read files from connected storage and knowledge base', category: 'information', risk: 'low', defaultEnabled: true },
  { name: 'file_write', label: 'File Write', description: 'Write and update files in connected storage', category: 'action', risk: 'medium', defaultEnabled: false },
  { name: 'calendar_read', label: 'Calendar Read', description: 'Read calendar events and availability', category: 'information', risk: 'low', defaultEnabled: true },
  { name: 'calendar_write', label: 'Calendar Write', description: 'Create and modify calendar events', category: 'action', risk: 'medium', defaultEnabled: false },
  { name: 'message_read', label: 'Read Messages', description: 'Read messages from connected channels', category: 'information', risk: 'low', defaultEnabled: true },
  { name: 'message_send', label: 'Send Messages', description: 'Send messages and replies via connected channels', category: 'communication', risk: 'high', defaultEnabled: false },
  { name: 'email_draft', label: 'Draft Emails', description: 'Draft email responses for human review', category: 'communication', risk: 'medium', defaultEnabled: true },
  { name: 'email_send', label: 'Send Emails', description: 'Send emails directly without human review', category: 'communication', risk: 'high', defaultEnabled: false },
  { name: 'issue_create', label: 'Create Issues', description: 'Create issues/tickets in connected project tools', category: 'action', risk: 'medium', defaultEnabled: true },
  { name: 'issue_close', label: 'Close Issues', description: 'Close or resolve issues/tickets', category: 'action', risk: 'medium', defaultEnabled: false },
];

const CATEGORIES = {
  information: { label: 'Information Gathering', description: 'Tools that read and search data' },
  action: { label: 'Actions', description: 'Tools that create or modify data' },
  communication: { label: 'Communication', description: 'Tools that send messages to people' },
};

const RISK_BADGES = {
  low: 'badge-green',
  medium: 'badge-yellow',
  high: 'badge-red',
};

export default function ToolsPage() {
  const [tools, setTools] = useState(
    AGENT_TOOLS.map(t => ({ ...t, enabled: t.defaultEnabled }))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState('');

  useEffect(() => {
    async function init() {
      const meRes = await fetch('/api/auth/me');
      const me = await meRes.json();
      if (meRes.ok) setTenantId(me.tenant.id);
    }
    init();
  }, []);

  async function toggleTool(name: string, enabled: boolean) {
    setSaving(name);
    setTools(prev => prev.map(t => t.name === name ? { ...t, enabled } : t));

    try {
      await fetch(`/api/tenants/${tenantId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: enabled ? 'tool.enable' : 'tool.disable',
          payload: { toolName: name },
        }),
      });
    } catch {
      setTools(prev => prev.map(t => t.name === name ? { ...t, enabled: !enabled } : t));
    } finally {
      setSaving(null);
    }
  }

  const enabledCount = tools.filter(t => t.enabled).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Tools</h1>
        <span className="text-sm text-muted">{enabledCount}/{tools.length} enabled</span>
      </div>
      <p className="text-muted text-sm mb-8">
        Control which tools your AI agent can use. Disabled tools cannot be invoked by any workflow.
        High-risk tools allow the agent to take actions visible to others.
      </p>

      {Object.entries(CATEGORIES).map(([categoryKey, category]) => {
        const categoryTools = tools.filter(t => t.category === categoryKey);
        return (
          <div key={categoryKey} className="mb-8">
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{category.label}</h2>
              <p className="text-xs text-muted">{category.description}</p>
            </div>
            <div className="space-y-2">
              {categoryTools.map((tool) => (
                <div key={tool.name} className="card flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{tool.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${RISK_BADGES[tool.risk]}`}>
                          {tool.risk}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">{tool.description}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleTool(tool.name, !tool.enabled)}
                    disabled={saving === tool.name}
                    aria-label={`${tool.enabled ? 'Disable' : 'Enable'} ${tool.label}`}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-foreground/20 ${
                      tool.enabled ? 'bg-status-green' : 'bg-border'
                    } ${saving === tool.name ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        tool.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
