'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorBoundary } from '../components/error-boundary';

const NAV_ITEMS = [
  { label: 'Overview', href: '/overview', icon: '◉' },
  { label: 'Integrations', href: '/integrations', icon: '⬡' },
  { label: 'Workflows', href: '/workflows', icon: '⚡' },
  { label: 'Automations', href: '/automations', icon: '⏱' },
  { label: 'Activity', href: '/activity', icon: '▤' },
  { label: 'Tools', href: '/tools', icon: '⚙' },
  { label: 'Knowledge', href: '/knowledge', icon: '◈' },
  { label: 'Monitoring', href: '/monitoring', icon: '◎' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 w-64 bg-background border-r border-border flex flex-col
        transform transition-transform md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <Link href="/overview" className="text-xl font-bold tracking-tight">
            duster
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm mb-1 transition-colors ${
                  active
                    ? 'bg-surface text-foreground'
                    : 'text-muted hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full text-left px-3 py-2 text-sm text-muted hover:text-foreground transition-colors rounded-md hover:bg-surface-hover"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border">
          <button onClick={() => setSidebarOpen(true)} className="text-foreground">
            ☰
          </button>
          <span className="font-bold">duster</span>
          <div className="w-6" />
        </div>

        <div className="max-w-6xl mx-auto p-4 md:p-8">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
