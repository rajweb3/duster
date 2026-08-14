import Link from 'next/link';

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="py-6 px-6 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">duster</Link>
          <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">Log in</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-16 px-6">
        <h1 className="text-3xl font-bold mb-4">Documentation</h1>
        <p className="text-muted mb-12">Everything you need to set up and run your Duster AI agent.</p>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="p-6 border border-border rounded-lg hover:border-foreground/20 transition-colors">
            <h2 className="font-semibold text-lg mb-2">Getting Started</h2>
            <p className="text-sm text-muted">Sign up, provision your GPU instance, and connect your first integration in under 5 minutes.</p>
          </div>

          <div className="p-6 border border-border rounded-lg hover:border-foreground/20 transition-colors">
            <h2 className="font-semibold text-lg mb-2">Connector Protocol</h2>
            <p className="text-sm text-muted">How the zero-knowledge bridge works. Event types, metadata format, and WebSocket lifecycle.</p>
          </div>

          <div className="p-6 border border-border rounded-lg hover:border-foreground/20 transition-colors">
            <h2 className="font-semibold text-lg mb-2">Workflows</h2>
            <p className="text-sm text-muted">Configure automated workflows for Slack triage, email drafts, meeting notes, and task creation.</p>
          </div>

          <div className="p-6 border border-border rounded-lg hover:border-foreground/20 transition-colors">
            <h2 className="font-semibold text-lg mb-2">Integrations</h2>
            <p className="text-sm text-muted">Connect Slack, email, and project tools. Learn how Events flow in and data flows out.</p>
          </div>

          <div className="p-6 border border-border rounded-lg hover:border-foreground/20 transition-colors">
            <h2 className="font-semibold text-lg mb-2">Knowledge Base</h2>
            <p className="text-sm text-muted">Upload documents and context that your AI agent uses to provide informed, company-specific responses.</p>
          </div>

          <div className="p-6 border border-border rounded-lg hover:border-foreground/20 transition-colors">
            <h2 className="font-semibold text-lg mb-2">API Reference</h2>
            <p className="text-sm text-muted">REST API for programmatic access to your agent, workflows, and monitoring data.</p>
          </div>
        </div>

        <div className="mt-16 p-6 border border-border rounded-lg bg-surface">
          <h2 className="font-semibold text-lg mb-2">Need help?</h2>
          <p className="text-sm text-muted">Email support@duster.dev or join our community Discord for live assistance.</p>
        </div>
      </main>

      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-muted">
          <span>&copy; 2026 Duster. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/docs" className="text-foreground">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
