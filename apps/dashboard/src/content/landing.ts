export interface HeroSection {
  headline: string;
  subheadline: string;
  cta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
}

export interface FeatureItem {
  title: string;
  description: string;
  icon: string;
}

export interface PricingSection {
  title: string;
  price: string;
  period: string;
  features: string[];
  cta: { label: string; href: string };
  note: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface LandingPageData {
  hero: HeroSection;
  features: FeatureItem[];
  howItWorks: { title: string; steps: { step: number; title: string; description: string }[] };
  pricing: PricingSection;
  faq: FaqItem[];
  footer: { copyright: string; links: { label: string; href: string }[] };
}

export function getLandingPageData(): LandingPageData {
  return {
    hero: {
      headline: 'Your AI team member. Zero knowledge shared.',
      subheadline: 'Duster gives your small team a dedicated AI agent running on private infrastructure. It triages messages, drafts responses, and automates workflows — without ever seeing your business data.',
      cta: { label: 'Get Started', href: '/signup' },
      secondaryCta: { label: 'See How It Works', href: '#how-it-works' },
    },

    features: [
      {
        title: 'Zero-Knowledge Architecture',
        description: 'Your AI agent runs on a dedicated GPU instance. The connector protocol physically cannot carry business content — only metadata flows through our systems.',
        icon: 'shield',
      },
      {
        title: 'Dedicated GPU Instance',
        description: 'NVIDIA L4 with 24GB VRAM running Muse Glimmer 30B locally. No shared infrastructure, no cold starts, no rate limits.',
        icon: 'cpu',
      },
      {
        title: 'Workflow Automation',
        description: 'Slack triage, email drafts, meeting notes, task creation — configure workflows from the dashboard and let your agent handle the rest.',
        icon: 'zap',
      },
      {
        title: 'Real-Time Monitoring',
        description: 'Live dashboard shows agent health, inference speed, active sessions, and workflow status. Full visibility without complexity.',
        icon: 'activity',
      },
      {
        title: 'Auto-Recovery',
        description: 'OOM detection, crash recovery with exponential backoff, and health monitoring. Your agent stays running without intervention.',
        icon: 'refresh-cw',
      },
      {
        title: 'Connector Protocol',
        description: 'Connect Slack, email, and project tools via our open connector protocol. Events flow in, actions flow out — your data stays put.',
        icon: 'link',
      },
    ],

    howItWorks: {
      title: 'Up and running in 3 steps',
      steps: [
        {
          step: 1,
          title: 'Provision',
          description: 'Sign up and we launch a dedicated GPU instance with your AI agent pre-configured and ready to go.',
        },
        {
          step: 2,
          title: 'Connect',
          description: 'Link your Slack workspace, email, or project tools. Only event metadata crosses the bridge — never content.',
        },
        {
          step: 3,
          title: 'Activate',
          description: 'Choose workflows from the catalog and configure them. Your agent starts working immediately.',
        },
      ],
    },

    pricing: {
      title: 'Simple, transparent pricing',
      price: '$499',
      period: '/month',
      features: [
        'Dedicated NVIDIA L4 GPU (24GB VRAM)',
        'Muse Glimmer 30B running locally',
        'Unlimited workflows and connectors',
        'Real-time dashboard monitoring',
        'Zero-knowledge architecture',
        'Auto-recovery and crash handling',
        'Priority support',
      ],
      cta: { label: 'Start Now', href: '/signup' },
      note: 'No setup fees. Cancel anytime. 7-day money-back guarantee.',
    },

    faq: [
      {
        question: 'What does "zero-knowledge" mean?',
        answer: 'Our connector protocol is designed so that business content (message bodies, email text, document content) physically cannot pass through our infrastructure. Only metadata like timestamps, channel names, and event types are transmitted. Your AI agent processes content locally on your dedicated instance.',
      },
      {
        question: 'What model does Duster use?',
        answer: 'Duster runs Muse Glimmer 30B by Meta, an Apache 2.0 licensed model optimized for instruction-following and tool use. It runs entirely on your dedicated NVIDIA L4 GPU with 24GB VRAM — no API calls to external model providers.',
      },
      {
        question: 'Can I use my own model?',
        answer: 'The platform runs on Ollama, so any compatible model that fits in 24GB VRAM can be swapped in. Contact us for custom model configuration.',
      },
      {
        question: 'What happens if my instance goes down?',
        answer: 'The sidecar includes automatic crash recovery with OOM detection and exponential backoff restarts. The dashboard shows real-time health status. If an instance is unrecoverable, we provision a replacement automatically.',
      },
      {
        question: 'How is this different from ChatGPT Teams or Claude for Business?',
        answer: 'Those are chat interfaces where you send data to a shared cloud model. Duster is an autonomous agent running on your own infrastructure — it connects to your tools, runs workflows automatically, and your data never leaves your instance.',
      },
      {
        question: 'What connectors are supported?',
        answer: 'Currently: Slack, email (IMAP/SMTP), and Trello. GitHub, Linear, Notion, and Google Workspace are on the roadmap. The connector protocol is open, so custom connectors can be built.',
      },
    ],

    footer: {
      copyright: `© ${new Date().getFullYear()} Duster. All rights reserved.`,
      links: [
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
        { label: 'Documentation', href: '/docs' },
        { label: 'Status', href: '/status' },
      ],
    },
  };
}

export function getMetaTags(): { title: string; description: string; ogImage: string } {
  return {
    title: 'Duster — Zero-Knowledge AI Agent for Small Teams',
    description: 'A dedicated AI team member running on private infrastructure. Automates Slack triage, email drafts, and workflows without ever seeing your business data.',
    ogImage: '/og-image.png',
  };
}
