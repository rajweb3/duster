import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBillingService, createSubscriptionStore } from './billing-service.js';
import { PLANS, getPlanById, getDefaultPlan } from './plans.js';
import type { BillingService, StripeAdapter, SubscriptionStore } from './billing-service.js';

function createMockStripe(): StripeAdapter {
  return {
    createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/session-1', sessionId: 'sess-1' }),
    constructWebhookEvent: vi.fn(),
    cancelSubscription: vi.fn().mockResolvedValue(undefined),
    getInvoices: vi.fn().mockResolvedValue([]),
  };
}

describe('plans', () => {
  it('has standard plan at $499/mo', () => {
    expect(PLANS).toHaveLength(1);
    expect(PLANS[0].id).toBe('standard');
    expect(PLANS[0].priceMonthly).toBe(499);
    expect(PLANS[0].currency).toBe('usd');
  });

  it('standard plan has key features', () => {
    const plan = PLANS[0];
    expect(plan.features.some(f => f.includes('GPU'))).toBe(true);
    expect(plan.features.some(f => f.includes('Muse Glimmer'))).toBe(true);
    expect(plan.features.some(f => f.includes('Zero-knowledge'))).toBe(true);
  });

  it('getPlanById returns plan', () => {
    expect(getPlanById('standard')?.name).toBe('Standard');
    expect(getPlanById('enterprise')).toBeUndefined();
  });

  it('getDefaultPlan returns standard', () => {
    expect(getDefaultPlan().id).toBe('standard');
  });
});

describe('subscriptionStore', () => {
  let store: SubscriptionStore;

  beforeEach(() => {
    store = createSubscriptionStore();
  });

  it('upserts and retrieves subscription', () => {
    store.upsert({
      id: 'sub-1',
      tenantId: 'tenant-1',
      planId: 'standard',
      stripeSubscriptionId: 'sub_stripe_1',
      stripeCustomerId: 'cus_1',
      status: 'active',
      currentPeriodStart: 1000,
      currentPeriodEnd: 2000,
      cancelAtPeriodEnd: false,
      createdAt: 1000,
    });
    const sub = store.getByTenantId('tenant-1');
    expect(sub?.status).toBe('active');
  });

  it('returns undefined for unknown tenant', () => {
    expect(store.getByTenantId('unknown')).toBeUndefined();
  });

  it('updates status', () => {
    store.upsert({
      id: 'sub-1',
      tenantId: 'tenant-1',
      planId: 'standard',
      stripeSubscriptionId: 'sub_stripe_1',
      stripeCustomerId: 'cus_1',
      status: 'active',
      currentPeriodStart: 1000,
      currentPeriodEnd: 2000,
      cancelAtPeriodEnd: false,
      createdAt: 1000,
    });
    store.updateStatus('tenant-1', 'past_due');
    expect(store.getByTenantId('tenant-1')?.status).toBe('past_due');
  });
});

describe('billingService', () => {
  let stripe: StripeAdapter;
  let subscriptionStore: SubscriptionStore;
  let service: BillingService;

  beforeEach(() => {
    stripe = createMockStripe();
    subscriptionStore = createSubscriptionStore();
    service = createBillingService(stripe, subscriptionStore);
  });

  describe('createCheckout', () => {
    it('creates checkout session for valid plan', async () => {
      const result = await service.createCheckout({
        tenantId: 'tenant-1',
        planId: 'standard',
        email: 'user@test.com',
        successUrl: 'https://app.duster.dev/success',
        cancelUrl: 'https://app.duster.dev/cancel',
      });

      expect(result.success).toBe(true);
      expect(result.sessionUrl).toContain('stripe.com');
      expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          priceId: 'price_duster_standard_monthly',
          customerEmail: 'user@test.com',
          metadata: { tenantId: 'tenant-1', planId: 'standard' },
        }),
      );
    });

    it('rejects unknown plan', async () => {
      const result = await service.createCheckout({
        tenantId: 'tenant-1',
        planId: 'enterprise',
        email: 'user@test.com',
        successUrl: 'https://x.com/ok',
        cancelUrl: 'https://x.com/cancel',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown plan');
    });

    it('handles stripe error', async () => {
      (stripe.createCheckoutSession as any).mockRejectedValue(new Error('Stripe unavailable'));
      const result = await service.createCheckout({
        tenantId: 'tenant-1',
        planId: 'standard',
        email: 'user@test.com',
        successUrl: 'https://x.com/ok',
        cancelUrl: 'https://x.com/cancel',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Stripe unavailable');
    });
  });

  describe('handleWebhook', () => {
    it('checkout.session.completed creates subscription', () => {
      const result = service.handleWebhook({
        type: 'checkout.session.completed',
        data: {
          metadata: { tenantId: 'tenant-1', planId: 'standard' },
          subscription: 'sub_123',
          customer: 'cus_456',
        },
      });

      expect(result.handled).toBe(true);
      expect(result.action).toBe('subscription_created');
      expect(result.tenantId).toBe('tenant-1');

      const sub = service.getSubscription('tenant-1');
      expect(sub?.status).toBe('active');
      expect(sub?.stripeSubscriptionId).toBe('sub_123');
    });

    it('invoice.paid updates to active', () => {
      subscriptionStore.upsert({
        id: 'sub-1', tenantId: 'tenant-1', planId: 'standard',
        stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1',
        status: 'past_due', currentPeriodStart: 0, currentPeriodEnd: 0,
        cancelAtPeriodEnd: false, createdAt: 0,
      });

      service.handleWebhook({
        type: 'invoice.paid',
        data: { metadata: { tenantId: 'tenant-1' } },
      });

      expect(service.getSubscription('tenant-1')?.status).toBe('active');
    });

    it('invoice.payment_failed sets past_due', () => {
      subscriptionStore.upsert({
        id: 'sub-1', tenantId: 'tenant-1', planId: 'standard',
        stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1',
        status: 'active', currentPeriodStart: 0, currentPeriodEnd: 0,
        cancelAtPeriodEnd: false, createdAt: 0,
      });

      service.handleWebhook({
        type: 'invoice.payment_failed',
        data: { metadata: { tenantId: 'tenant-1' } },
      });

      expect(service.getSubscription('tenant-1')?.status).toBe('past_due');
    });

    it('customer.subscription.deleted sets canceled', () => {
      subscriptionStore.upsert({
        id: 'sub-1', tenantId: 'tenant-1', planId: 'standard',
        stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1',
        status: 'active', currentPeriodStart: 0, currentPeriodEnd: 0,
        cancelAtPeriodEnd: false, createdAt: 0,
      });

      service.handleWebhook({
        type: 'customer.subscription.deleted',
        data: { metadata: { tenantId: 'tenant-1' } },
      });

      expect(service.getSubscription('tenant-1')?.status).toBe('canceled');
    });

    it('returns not handled for unknown event type', () => {
      const result = service.handleWebhook({ type: 'unknown.event', data: {} });
      expect(result.handled).toBe(false);
    });

    it('missing metadata returns error', () => {
      const result = service.handleWebhook({
        type: 'checkout.session.completed',
        data: {},
      });
      expect(result.handled).toBe(false);
      expect(result.error).toContain('metadata');
    });
  });

  describe('cancelSubscription', () => {
    it('cancels active subscription', async () => {
      subscriptionStore.upsert({
        id: 'sub-1', tenantId: 'tenant-1', planId: 'standard',
        stripeSubscriptionId: 'sub_stripe_1', stripeCustomerId: 'cus_1',
        status: 'active', currentPeriodStart: 0, currentPeriodEnd: 0,
        cancelAtPeriodEnd: false, createdAt: 0,
      });

      const result = await service.cancelSubscription('tenant-1');
      expect(result.success).toBe(true);
      expect(stripe.cancelSubscription).toHaveBeenCalledWith('sub_stripe_1');
      expect(service.getSubscription('tenant-1')?.status).toBe('canceled');
    });

    it('returns error for missing subscription', async () => {
      const result = await service.cancelSubscription('nobody');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No subscription');
    });
  });

  describe('isActive', () => {
    it('returns true for active subscription', () => {
      subscriptionStore.upsert({
        id: 'sub-1', tenantId: 'tenant-1', planId: 'standard',
        stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1',
        status: 'active', currentPeriodStart: 0, currentPeriodEnd: 0,
        cancelAtPeriodEnd: false, createdAt: 0,
      });
      expect(service.isActive('tenant-1')).toBe(true);
    });

    it('returns true for trialing', () => {
      subscriptionStore.upsert({
        id: 'sub-1', tenantId: 'tenant-1', planId: 'standard',
        stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1',
        status: 'trialing', currentPeriodStart: 0, currentPeriodEnd: 0,
        cancelAtPeriodEnd: false, createdAt: 0,
      });
      expect(service.isActive('tenant-1')).toBe(true);
    });

    it('returns false for canceled', () => {
      subscriptionStore.upsert({
        id: 'sub-1', tenantId: 'tenant-1', planId: 'standard',
        stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1',
        status: 'canceled', currentPeriodStart: 0, currentPeriodEnd: 0,
        cancelAtPeriodEnd: false, createdAt: 0,
      });
      expect(service.isActive('tenant-1')).toBe(false);
    });

    it('returns false for unknown tenant', () => {
      expect(service.isActive('nobody')).toBe(false);
    });
  });
});
