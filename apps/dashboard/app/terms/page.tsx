import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="py-6 px-6 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">duster</Link>
          <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">Log in</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-16 px-6">
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
        <p className="text-muted mb-4">Last updated: August 2026</p>

        <div className="prose prose-invert space-y-6 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">1. Service Description</h2>
            <p>Duster provides a dedicated AI agent running on private GPU infrastructure for small teams. The service includes a dedicated NVIDIA L4 GPU instance, real-time dashboard, workflow automation, and integration connectors.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">2. Subscription and Billing</h2>
            <p>The service is billed at $499/month. You may cancel at any time. We offer a 7-day money-back guarantee for new subscribers. Billing is processed through Stripe. Upon cancellation, your instance will be terminated and data deleted within 30 days.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">3. Acceptable Use</h2>
            <p>You agree not to use the service to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Generate content that violates applicable laws</li>
              <li>Attempt to access other tenants&apos; instances or data</li>
              <li>Reverse-engineer the connector protocol</li>
              <li>Exceed the resource limits of your dedicated instance</li>
              <li>Use the service for cryptocurrency mining or other non-AI workloads</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">4. Data Ownership</h2>
            <p>You retain full ownership of all data processed by your AI agent. Duster has zero access to your business content due to our zero-knowledge architecture. We claim no rights to your data, outputs, or trained models.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">5. Service Level</h2>
            <p>We target 99.9% uptime for the control plane (dashboard, monitoring). Your dedicated GPU instance availability depends on AWS infrastructure. We provide auto-recovery with OOM detection and exponential backoff.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">6. Limitation of Liability</h2>
            <p>Duster is provided &quot;as is&quot; without warranty. Our liability is limited to the amount paid for the service in the preceding 12 months. We are not liable for data loss on your dedicated instance beyond providing recovery mechanisms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">7. Changes to Terms</h2>
            <p>We may update these terms with 30 days notice via email. Continued use after the notice period constitutes acceptance.</p>
          </section>
        </div>
      </main>

      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-muted">
          <span>&copy; 2026 Duster. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="text-foreground">Terms</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
