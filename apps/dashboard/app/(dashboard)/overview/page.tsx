'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OverviewSkeleton } from '../../components/skeleton';

interface TenantData {
  tenant: { id: string; name: string; status: string; instanceId?: string; provisionedAt?: string };
  connectors: { type: string; status: string }[];
  workflows: { name: string; status: string; runCount: number; skillId: string }[];
}

export default function OverviewPage() {
  const [data, setData] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  useEffect(() => {
    // Check for verification success
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === 'true') {
      setEmailVerified(true);
    }

    async function load() {
      try {
        const meRes = await fetch('/api/auth/me');
        const me = await meRes.json();
        if (!meRes.ok) throw new Error(me.error);

        setEmailVerified(me.user?.emailVerified ?? null);

        const res = await fetch(`/api/tenants/${me.tenant.id}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setData(d);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <OverviewSkeleton />;
  if (error) return <div className="text-status-red">{error}</div>;
  if (!data) return null;

  const statusColor = {
    active: 'badge-green',
    provisioning: 'badge-yellow',
    suspended: 'badge-red',
    terminated: 'badge-red',
  }[data.tenant.status] || 'badge-yellow';

  return (
    <div>
      {/* Email verification banner */}
      {emailVerified === false && (
        <div className="mb-6 p-4 bg-status-yellow/10 border border-status-yellow/20 rounded-lg flex items-center justify-between">
          <div className="text-sm">
            <strong>Verify your email</strong> — check your inbox for a verification link.
          </div>
          <button
            onClick={async () => {
              await fetch('/api/auth/resend-verification', { method: 'POST' });
            }}
            className="text-xs btn-secondary px-2 py-1"
          >
            Resend
          </button>
        </div>
      )}

      {emailVerified === true && new URLSearchParams(window.location.search).get('verified') && (
        <div className="mb-6 p-4 bg-status-green/10 border border-status-green/20 rounded-lg text-sm text-status-green">
          Email verified successfully!
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{data.tenant.name}</h1>
          <p className="text-sm text-muted mt-1">
            Instance: {data.tenant.instanceId || 'Provisioning...'}
            {data.tenant.provisionedAt && (
              <span className="ml-2">· Since {new Date(data.tenant.provisionedAt).toLocaleDateString()}</span>
            )}
          </p>
        </div>
        <span className={statusColor}>{data.tenant.status}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <div className="text-sm text-muted mb-1">Agent Status</div>
          <div className={`text-2xl font-bold ${data.tenant.status === 'active' ? 'text-status-green' : 'text-muted'}`}>
            {data.tenant.status === 'active' ? '● Online' : '○ Offline'}
          </div>
        </div>
        <Link href="/integrations" className="card hover:bg-surface-hover transition-colors">
          <div className="text-sm text-muted mb-1">Connectors</div>
          <div className="text-2xl font-bold">
            {data.connectors.filter(c => c.status === 'connected').length}
            <span className="text-muted text-lg">/{data.connectors.length}</span>
          </div>
        </Link>
        <Link href="/workflows" className="card hover:bg-surface-hover transition-colors">
          <div className="text-sm text-muted mb-1">Active Workflows</div>
          <div className="text-2xl font-bold">
            {data.workflows.filter(w => w.status === 'active').length}
            <span className="text-muted text-lg">/{data.workflows.length}</span>
          </div>
        </Link>
      </div>

      {/* Quick actions when nothing configured */}
      {data.connectors.length === 0 && data.workflows.length === 0 && data.tenant.status === 'active' && (
        <div className="card mb-8 text-center py-8">
          <h2 className="text-lg font-semibold mb-2">Get started</h2>
          <p className="text-sm text-muted mb-6">
            Your instance is ready. Connect a tool or activate a workflow to start your agent.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/integrations" className="btn-primary">Connect a tool</Link>
            <Link href="/workflows" className="btn-secondary">Activate workflow</Link>
          </div>
        </div>
      )}

      {/* Recent workflows */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Workflows</h2>
          {data.workflows.length > 0 && (
            <Link href="/workflows" className="text-xs text-muted hover:text-foreground transition-colors">
              View all →
            </Link>
          )}
        </div>
        {data.workflows.length === 0 ? (
          <p className="text-sm text-muted">
            No workflows configured.{' '}
            <Link href="/workflows" className="text-foreground hover:underline">Get started</Link>
          </p>
        ) : (
          <div className="space-y-3">
            {data.workflows.slice(0, 5).map((w, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <div className="text-sm font-medium">{w.name}</div>
                  <div className="text-xs text-muted">{w.runCount} runs</div>
                </div>
                <span className={w.status === 'active' ? 'badge-green' : 'badge-yellow'}>
                  {w.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
