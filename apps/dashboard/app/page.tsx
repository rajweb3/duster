import Link from 'next/link';

const FEATURES = [
  { title: 'Zero-Knowledge Architecture', description: 'Your AI agent runs on a dedicated GPU instance. The connector protocol physically cannot carry business content — only metadata flows through our systems.', icon: '🛡️' },
  { title: 'Dedicated GPU Instance', description: 'NVIDIA L4 with 24GB VRAM running Muse Glimmer 30B locally. No shared infrastructure, no cold starts, no rate limits.', icon: '⚡' },
  { title: 'Workflow Automation', description: 'Slack triage, email drafts, meeting notes, task creation — configure workflows from the dashboard and let your agent handle the rest.', icon: '🔄' },
  { title: 'Real-Time Monitoring', description: 'Live dashboard shows agent health, inference speed, active sessions, and workflow status. Full visibility without complexity.', icon: '📊' },
  { title: 'Auto-Recovery', description: 'OOM detection, crash recovery with exponential backoff, and health monitoring. Your agent stays running without intervention.', icon: '🔧' },
  { title: 'Open Connector Protocol', description: 'Connect Slack, email, and project tools. Events flow in, actions flow out — your data stays put.', icon: '🔗' },
];

const STEPS = [
  { num: 1, title: 'Provision', desc: 'Sign up and we launch a dedicated GPU instance with your AI agent pre-configured.' },
  { num: 2, title: 'Connect', desc: 'Link your Slack workspace, email, or project tools. Only event metadata crosses the bridge.' },
  { num: 3, title: 'Activate', desc: 'Choose workflows from the catalog and configure them. Your agent starts working immediately.' },
];

const FAQ = [
  { q: 'What does "zero-knowledge" mean?', a: 'Our connector protocol is designed so that business content physically cannot pass through our infrastructure. Only metadata like timestamps and event types are transmitted.' },
  { q: 'What model does Duster use?', a: 'Muse Glimmer 30B by Meta, running entirely on your dedicated NVIDIA L4 GPU with 24GB VRAM — no API calls to external providers.' },
  { q: 'How is this different from ChatGPT Teams?', a: 'Those are chat interfaces on shared cloud models. Duster is an autonomous agent on your own hardware that connects to your tools and runs workflows automatically.' },
  { q: 'What happens if my instance goes down?', a: 'Auto-recovery with OOM detection and exponential backoff. If unrecoverable, we provision a replacement automatically.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">duster</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/signup" className="btn-primary">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
            Your AI team member.
            <br />
            <span className="text-muted">Zero knowledge shared.</span>
          </h1>
          <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
            Duster gives your small team a dedicated AI agent running on private infrastructure.
            It triages messages, drafts responses, and automates workflows — without ever seeing your business data.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/signup" className="btn-primary text-base px-6 py-3">
              Get Started — $499/mo
            </Link>
            <a href="#how-it-works" className="btn-secondary text-base px-6 py-3">
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Built for teams that can&apos;t compromise on privacy</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Up and running in 3 steps</h2>
          <div className="space-y-8">
            {STEPS.map((s) => (
              <div key={s.num} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center font-bold">
                  {s.num}
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{s.title}</h3>
                  <p className="text-muted mt-1">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Simple, transparent pricing</h2>
          <div className="card mt-8">
            <div className="text-5xl font-bold">$499<span className="text-lg text-muted font-normal">/month</span></div>
            <ul className="mt-6 space-y-3 text-left">
              {['Dedicated NVIDIA L4 GPU (24GB VRAM)', 'Muse Glimmer 30B local inference', 'Unlimited workflows & connectors', 'Real-time dashboard', 'Zero-knowledge architecture', 'Auto-recovery', 'Priority support'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <span className="text-status-green">✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-primary w-full mt-8 block text-center py-3">
              Start Now
            </Link>
            <p className="text-xs text-muted mt-3">No setup fees. Cancel anytime. 7-day money-back guarantee.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">FAQ</h2>
          <div className="space-y-6">
            {FAQ.map((item) => (
              <div key={item.q} className="card">
                <h3 className="font-semibold">{item.q}</h3>
                <p className="text-sm text-muted mt-2 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-muted">
          <span>© 2024 Duster. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
