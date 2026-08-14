import type {
  Subscription,
  SubscriptionStatus,
  CheckoutRequest,
  CheckoutResult,
  WebhookEvent,
  InvoiceInfo,
} from './types.js';
import { getPlanById } from './plans.js';

export interface StripeAdapter {
  createCheckoutSession(params: {
    priceId: string;
    customerEmail: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }>;

  constructWebhookEvent(payload: string, signature: string): WebhookEvent;

  cancelSubscription(subscriptionId: string): Promise<void>;
  getInvoices(customerId: string): Promise<InvoiceInfo[]>;
}

export interface SubscriptionStore {
  getByTenantId(tenantId: string): Subscription | undefined;
  upsert(subscription: Subscription): void;
  updateStatus(tenantId: string, status: SubscriptionStatus): void;
}

export interface BillingService {
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  handleWebhook(event: WebhookEvent): WebhookResult;
  getSubscription(tenantId: string): Subscription | undefined;
  cancelSubscription(tenantId: string): Promise<{ success: boolean; error?: string }>;
  isActive(tenantId: string): boolean;
}

export interface WebhookResult {
  handled: boolean;
  action?: string;
  tenantId?: string;
  error?: string;
}

export function createBillingService(
  stripe: StripeAdapter,
  subscriptions: SubscriptionStore,
): BillingService {
  return {
    async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
      const plan = getPlanById(request.planId);
      if (!plan) {
        return { success: false, error: `Unknown plan: ${request.planId}` };
      }

      try {
        const result = await stripe.createCheckoutSession({
          priceId: plan.stripePriceId,
          customerEmail: request.email,
          metadata: { tenantId: request.tenantId, planId: request.planId },
          successUrl: request.successUrl,
          cancelUrl: request.cancelUrl,
        });
        return { success: true, sessionUrl: result.url };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },

    handleWebhook(event: WebhookEvent): WebhookResult {
      switch (event.type) {
        case 'checkout.session.completed': {
          const data = event.data as any;
          const tenantId = data.metadata?.tenantId;
          const planId = data.metadata?.planId;
          if (!tenantId || !planId) {
            return { handled: false, error: 'Missing metadata' };
          }
          const subscription: Subscription = {
            id: `sub-${tenantId}`,
            tenantId,
            planId,
            stripeSubscriptionId: data.subscription || '',
            stripeCustomerId: data.customer || '',
            status: 'active',
            currentPeriodStart: Date.now(),
            currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
            cancelAtPeriodEnd: false,
            createdAt: Date.now(),
          };
          subscriptions.upsert(subscription);
          return { handled: true, action: 'subscription_created', tenantId };
        }

        case 'invoice.paid': {
          const data = event.data as any;
          const tenantId = data.metadata?.tenantId;
          if (tenantId) {
            subscriptions.updateStatus(tenantId, 'active');
          }
          return { handled: true, action: 'invoice_paid', tenantId };
        }

        case 'invoice.payment_failed': {
          const data = event.data as any;
          const tenantId = data.metadata?.tenantId;
          if (tenantId) {
            subscriptions.updateStatus(tenantId, 'past_due');
          }
          return { handled: true, action: 'payment_failed', tenantId };
        }

        case 'customer.subscription.deleted': {
          const data = event.data as any;
          const tenantId = data.metadata?.tenantId;
          if (tenantId) {
            subscriptions.updateStatus(tenantId, 'canceled');
          }
          return { handled: true, action: 'subscription_canceled', tenantId };
        }

        default:
          return { handled: false, error: `Unhandled event type: ${event.type}` };
      }
    },

    getSubscription(tenantId: string): Subscription | undefined {
      return subscriptions.getByTenantId(tenantId);
    },

    async cancelSubscription(tenantId: string): Promise<{ success: boolean; error?: string }> {
      const sub = subscriptions.getByTenantId(tenantId);
      if (!sub) {
        return { success: false, error: 'No subscription found' };
      }
      try {
        await stripe.cancelSubscription(sub.stripeSubscriptionId);
        subscriptions.updateStatus(tenantId, 'canceled');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },

    isActive(tenantId: string): boolean {
      const sub = subscriptions.getByTenantId(tenantId);
      if (!sub) return false;
      return sub.status === 'active' || sub.status === 'trialing';
    },
  };
}

export function createSubscriptionStore(): SubscriptionStore {
  const store = new Map<string, Subscription>();

  return {
    getByTenantId(tenantId: string): Subscription | undefined {
      return store.get(tenantId);
    },

    upsert(subscription: Subscription): void {
      store.set(subscription.tenantId, subscription);
    },

    updateStatus(tenantId: string, status: SubscriptionStatus): void {
      const sub = store.get(tenantId);
      if (sub) {
        store.set(tenantId, { ...sub, status });
      }
    },
  };
}
