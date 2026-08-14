export interface BillingPlan {
  id: string;
  name: string;
  priceMonthly: number;
  currency: string;
  features: string[];
  stripePriceId: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: SubscriptionStatus;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  createdAt: number;
}

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'trialing';

export interface CheckoutRequest {
  tenantId: string;
  planId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  success: boolean;
  sessionUrl?: string;
  error?: string;
}

export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface InvoiceInfo {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  periodStart: number;
  periodEnd: number;
  paidAt?: number;
  hostedUrl?: string;
}
