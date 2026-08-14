import type { BillingPlan } from './types.js';

export const PLANS: BillingPlan[] = [
  {
    id: 'standard',
    name: 'Standard',
    priceMonthly: 499,
    currency: 'usd',
    stripePriceId: 'price_duster_standard_monthly',
    features: [
      'Dedicated GPU instance (NVIDIA L4, 24GB VRAM)',
      'Muse Glimmer 30B local inference',
      'Hermes Agent framework',
      'Unlimited workflows',
      'Slack, email, and project management connectors',
      'Real-time dashboard monitoring',
      'Zero-knowledge architecture',
      'Auto-recovery and crash handling',
    ],
  },
];

export function getPlanById(planId: string): BillingPlan | undefined {
  return PLANS.find(p => p.id === planId);
}

export function getDefaultPlan(): BillingPlan {
  return PLANS[0];
}
