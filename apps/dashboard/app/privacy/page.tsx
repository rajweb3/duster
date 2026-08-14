import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="py-6 px-6 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">duster</Link>
          <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">Log in</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-16 px-6">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-muted mb-4">Last updated: August 2026</p>

        <div className="prose prose-invert space-y-6 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">Zero-Knowledge Architecture</h2>
            <p>Duster is built on a zero-knowledge architecture. Your business content physically cannot pass through our infrastructure. Our connector protocol transmits only event metadata like timestamps and event types. We never have access to your actual data.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">What We Collect</h2>
            <p>We collect only what is necessary to operate the service:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Account information (email, name, team name)</li>
              <li>Billing information (processed by Stripe, never stored on our servers)</li>
              <li>Event metadata (timestamps, connection status, error counts)</li>
              <li>Usage metrics (API call counts, feature usage patterns)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">What We Never Collect</h2>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Your business content, documents, or messages</li>
              <li>AI agent conversation contents</li>
              <li>File contents from your connected integrations</li>
              <li>Encryption keys (generated and stored on your dedicated instance)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">Data Security</h2>
            <p>All connections use mTLS (mutual TLS) encryption. Your dedicated GPU instance runs in an isolated VPC. Data at rest on your instance is encrypted with AES-256-GCM using keys that only your instance holds.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">Data Retention</h2>
            <p>Event metadata is retained for 90 days for monitoring and debugging purposes. Account data is retained while your subscription is active and deleted within 30 days of account termination.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">Contact</h2>
            <p>For privacy inquiries: privacy@duster.dev</p>
          </section>
        </div>
      </main>

      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-muted">
          <span>&copy; 2026 Duster. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
