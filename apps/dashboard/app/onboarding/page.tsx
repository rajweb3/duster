'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'payment' | 'provisioning' | 'connect' | 'activate';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('payment');
  const [tenantId, setTenantId] = useState('');
  const [provisionStatus, setProvisionStatus] = useState<'pending' | 'running' | 'ready'>('pending');
  const [error, setError] = useState('');

  useEffect(() => {
    async function init() {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.tenant) {
        setTenantId(data.tenant.id);
        if (data.tenant.status === 'active') {
          setStep('connect');
          setProvisionStatus('ready');
        } else {
          // Check if payment done (subscription exists)
          setStep('payment');
        }
      }
    }
    init();
  }, []);

  async function startCheckout() {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        successUrl: `${window.location.origin}/onboarding?step=provisioning`,
        cancelUrl: `${window.location.origin}/onboarding`,
      }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setError('Failed to start checkout');
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('step') === 'provisioning' || params.get('checkout') === 'success') {
      setStep('provisioning');
      setProvisionStatus('running');
      pollProvisionStatus();
    }
  }, []);

  async function pollProvisionStatus() {
    const interval = setInterval(async () => {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.tenant?.status === 'active') {
        setProvisionStatus('ready');
        setStep('connect');
        clearInterval(interval);
      }
    }, 5000);

    // Timeout after 10 minutes
    setTimeout(() => {
      clearInterval(interval);
      if (provisionStatus !== 'ready') {
        setError('Provisioning is taking longer than expected. Please contact support.');
      }
    }, 600000);
  }

  function skipToActivate() {
    setStep('activate');
  }

  function finish() {
    router.push('/overview');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Set up your AI agent</h1>
          <p className="text-muted text-sm mt-2">Three steps to get your team's AI assistant running.</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['payment', 'provisioning', 'connect', 'activate'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-foreground text-background' :
                (['payment', 'provisioning', 'connect', 'activate'].indexOf(step) > i) ? 'bg-status-green text-white' :
                'bg-border text-muted'
              }`}>
                {(['payment', 'provisioning', 'connect', 'activate'].indexOf(step) > i) ? '✓' : i + 1}
              </div>
              {i < 3 && <div className="w-8 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-3 bg-status-red/10 border border-status-red/20 rounded-md text-sm text-status-red">
            {error}
          </div>
        )}

        {/* Step content */}
        <div className="card">
          {step === 'payment' && (
            <div className="text-center py-4">
              <h2 className="text-lg font-semibold mb-2">Start your subscription</h2>
              <p className="text-sm text-muted mb-6">
                $499/month for a dedicated GPU instance with your AI agent. Cancel anytime.
              </p>
              <button onClick={startCheckout} className="btn-primary px-8 py-3">
                Subscribe — $499/mo
              </button>
              <p className="text-xs text-muted mt-3">7-day money-back guarantee</p>
            </div>
          )}

          {step === 'provisioning' && (
            <div className="text-center py-4">
              <h2 className="text-lg font-semibold mb-2">Provisioning your instance</h2>
              <div className="mt-6 mb-4">
                {provisionStatus === 'running' && (
                  <div className="animate-pulse text-4xl">⚡</div>
                )}
                {provisionStatus === 'ready' && (
                  <div className="text-4xl text-status-green">✓</div>
                )}
              </div>
              <p className="text-sm text-muted">
                {provisionStatus === 'running'
                  ? 'Launching your dedicated NVIDIA L4 instance. This takes 2-5 minutes...'
                  : 'Your instance is ready!'}
              </p>
              {provisionStatus === 'ready' && (
                <button onClick={() => setStep('connect')} className="btn-primary mt-6">
                  Continue
                </button>
              )}
            </div>
          )}

          {step === 'connect' && (
            <div className="py-4">
              <h2 className="text-lg font-semibold mb-2">Connect your first tool</h2>
              <p className="text-sm text-muted mb-6">
                Choose a connector to link with your agent. You can add more later.
              </p>
              <div className="space-y-3">
                {[
                  { type: 'slack', name: 'Slack', icon: '💬' },
                  { type: 'email', name: 'Email', icon: '📧' },
                  { type: 'trello', name: 'Trello', icon: '📋' },
                ].map((c) => (
                  <button
                    key={c.type}
                    onClick={skipToActivate}
                    className="w-full card flex items-center gap-3 hover:bg-surface-hover transition-colors cursor-pointer text-left"
                  >
                    <span className="text-xl">{c.icon}</span>
                    <span className="font-medium text-sm">{c.name}</span>
                  </button>
                ))}
              </div>
              <button onClick={skipToActivate} className="w-full mt-4 text-sm text-muted hover:text-foreground transition-colors">
                Skip for now →
              </button>
            </div>
          )}

          {step === 'activate' && (
            <div className="py-4">
              <h2 className="text-lg font-semibold mb-2">Activate a workflow</h2>
              <p className="text-sm text-muted mb-6">
                Choose a workflow to get your agent working immediately.
              </p>
              <div className="space-y-3">
                {[
                  { id: 'slack-triage', name: 'Slack Triage', desc: 'Auto-categorize and route messages' },
                  { id: 'email-assistant', name: 'Email Assistant', desc: 'Prioritize and draft responses' },
                  { id: 'daily-digest', name: 'Daily Digest', desc: 'Morning summary of activity' },
                ].map((w) => (
                  <button
                    key={w.id}
                    onClick={finish}
                    className="w-full card flex items-start gap-3 hover:bg-surface-hover transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <div className="font-medium text-sm">{w.name}</div>
                      <div className="text-xs text-muted">{w.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={finish} className="w-full mt-4 text-sm text-muted hover:text-foreground transition-colors">
                Skip — I&apos;ll configure later →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
