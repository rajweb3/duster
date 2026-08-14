'use client';

import { useEffect, useState } from 'react';

const AVAILABLE_CONNECTORS = [
  { type: 'slack', name: 'Slack', description: 'Monitor channels, triage messages, send notifications', icon: '💬', configFields: [{ key: 'webhookUrl', label: 'Webhook URL', type: 'url', placeholder: 'https://hooks.slack.com/...' }] },
  { type: 'email', name: 'Email (IMAP)', description: 'Process incoming emails, draft responses, categorize', icon: '📧', configFields: [{ key: 'imapHost', label: 'IMAP Host', type: 'text', placeholder: 'imap.gmail.com' }, { key: 'email', label: 'Email', type: 'email', placeholder: 'agent@yourco.com' }, { key: 'password', label: 'App Password', type: 'password', placeholder: '••••••••' }] },
  { type: 'trello', name: 'Trello', description: 'Create cards, track tasks, sync action items', icon: '📋', configFields: [{ key: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Your Trello API key' }, { key: 'token', label: 'Token', type: 'password', placeholder: 'Your Trello token' }] },
  { type: 'github', name: 'GitHub', description: 'Monitor issues, review PRs, comment on threads', icon: '🐙', configFields: [{ key: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_...' }, { key: 'repos', label: 'Repositories', type: 'text', placeholder: 'org/repo1, org/repo2' }] },
  { type: 'linear', name: 'Linear', description: 'Create issues, update status, sync project progress', icon: '◆', configFields: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'lin_api_...' }] },
  { type: 'notion', name: 'Notion', description: 'Read pages, create entries, search knowledge base', icon: '📝', configFields: [{ key: 'token', label: 'Integration Token', type: 'password', placeholder: 'secret_...' }] },
];

interface Connector {
  id: string;
  type: string;
  status: string;
  config: Record<string, unknown>;
  lastEventAt: string | null;
}

export default function IntegrationsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState('');
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch('/api/auth/me');
        const me = await meRes.json();
        if (!meRes.ok) return;
        setTenantId(me.tenant.id);

        const res = await fetch(`/api/tenants/${me.tenant.id}/connectors`);
        const data = await res.json();
        setConnectors(data);
      } catch {
        setError('Failed to load integrations');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function connectConnector(type: string) {
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/tenants/${tenantId}/connectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, config: configValues }),
      });

      if (res.ok) {
        const connector = await res.json();
        setConnectors(prev => [...prev.filter(c => c.type !== type), connector]);
        setConfiguring(null);
        setConfigValues({});
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to connect');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(type: string) {
    const res = await fetch(`/api/tenants/${tenantId}/connectors?type=${type}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setConnectors(prev => prev.filter(c => c.type !== type));
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Integrations</h1>
        <div className="space-y-4 mt-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-border" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-border rounded w-1/4" />
                <div className="h-3 bg-border rounded w-1/2" />
              </div>
              <div className="h-6 bg-border rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Integrations</h1>
      <p className="text-muted text-sm mb-8">
        Connect your tools. Only event metadata flows through — content stays on your instance.
      </p>

      {error && (
        <div className="mb-6 p-3 bg-status-red/10 border border-status-red/20 rounded-md text-sm text-status-red">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-xs underline">dismiss</button>
        </div>
      )}

      <div className="space-y-4">
        {AVAILABLE_CONNECTORS.map((ac) => {
          const connected = connectors.find(c => c.type === ac.type && c.status === 'connected');
          const isConfiguring = configuring === ac.type;

          return (
            <div key={ac.type} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl w-10 text-center">{ac.icon}</span>
                  <div>
                    <div className="font-medium">{ac.name}</div>
                    <div className="text-sm text-muted">{ac.description}</div>
                    {connected?.lastEventAt && (
                      <div className="text-xs text-muted mt-0.5">
                        Last event: {new Date(connected.lastEventAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {connected ? (
                    <>
                      <span className="badge-green">Connected</span>
                      <button
                        onClick={() => disconnect(ac.type)}
                        className="btn-secondary text-xs px-2 py-1"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : !isConfiguring ? (
                    <button
                      onClick={() => {
                        setConfiguring(ac.type);
                        setConfigValues({});
                      }}
                      className="btn-primary text-xs px-3 py-1"
                    >
                      Connect
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Config form */}
              {isConfiguring && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="space-y-3 max-w-md">
                    {ac.configFields.map((field) => (
                      <div key={field.key}>
                        <label className="label">{field.label}</label>
                        <input
                          type={field.type}
                          className="input"
                          placeholder={field.placeholder}
                          value={configValues[field.key] || ''}
                          onChange={e => setConfigValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => connectConnector(ac.type)}
                      disabled={saving}
                      className="btn-primary text-xs px-4 py-2"
                    >
                      {saving ? 'Connecting...' : 'Save & Connect'}
                    </button>
                    <button
                      onClick={() => { setConfiguring(null); setConfigValues({}); }}
                      className="btn-secondary text-xs px-3 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
