'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setError('Missing reset token. Please request a new password reset link.');
    } else {
      setToken(t);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Password reset successful</h1>
        <p className="text-muted text-sm mb-6">
          Your password has been changed. Redirecting to login...
        </p>
        <Link href="/login" className="text-sm text-foreground hover:underline">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Choose a new password</h1>
      <p className="text-muted text-sm mb-6">
        Enter your new password below.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-status-red/10 border border-status-red/20 rounded-md text-sm text-status-red">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="label">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input"
            placeholder="At least 8 characters"
            required
            minLength={8}
            autoFocus
          />
          <p className="text-xs text-muted mt-1">
            Must contain uppercase, lowercase, and a number.
          </p>
        </div>

        <div>
          <label htmlFor="confirm" className="label">Confirm password</label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="input"
            placeholder="Repeat your password"
            required
            minLength={8}
          />
        </div>

        <button type="submit" disabled={loading || !token} className="btn-primary w-full">
          {loading ? 'Resetting...' : 'Reset password'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="text-foreground hover:underline">Back to login</Link>
      </p>
    </div>
  );
}
