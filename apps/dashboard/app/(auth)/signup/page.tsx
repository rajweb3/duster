'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', name: '', teamName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Signup failed');
        return;
      }

      router.push('/onboarding');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-6">Create your account</h2>

      {error && (
        <div className="mb-4 p-3 bg-status-red/10 border border-status-red/20 rounded-md text-sm text-status-red">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="label">Your name</label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="input"
            placeholder="Jane Smith"
            required
          />
        </div>

        <div>
          <label htmlFor="teamName" className="label">Team name</label>
          <input
            id="teamName"
            type="text"
            value={form.teamName}
            onChange={(e) => update('teamName', e.target.value)}
            className="input"
            placeholder="Acme Inc"
            required
          />
        </div>

        <div>
          <label htmlFor="email" className="label">Work email</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className="input"
            placeholder="you@company.com"
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            className="input"
            placeholder="Min 8 chars, uppercase, lowercase, number"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account — $499/mo'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground hover:underline">
          Log in
        </Link>
      </p>

      <p className="mt-3 text-center text-xs text-muted">
        7-day money-back guarantee. Cancel anytime.
      </p>
    </div>
  );
}
