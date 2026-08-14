import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { db } from '@/db';
import { subscriptions, tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';
import { webhookLimiter, getClientIp } from '@/lib/rate-limit';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = webhookLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const body = await request.text();
  const sig = headers().get('stripe-signature')!;
  const stripe = getStripe();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId;
      if (!tenantId) break;

      const subscriptionId = session.subscription as string;
      const customerId = session.customer as string;

      const sub = await stripe.subscriptions.retrieve(subscriptionId) as any;

      await db.insert(subscriptions).values({
        tenantId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: 'active',
        currentPeriodStart: new Date((sub.current_period_start || 0) * 1000),
        currentPeriodEnd: new Date((sub.current_period_end || 0) * 1000),
      }).onConflictDoUpdate({
        target: subscriptions.tenantId,
        set: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status: 'active',
          currentPeriodStart: new Date((sub.current_period_start || 0) * 1000),
          currentPeriodEnd: new Date((sub.current_period_end || 0) * 1000),
          updatedAt: new Date(),
        },
      });

      await db.update(tenants)
        .set({ status: 'provisioning', updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));

      await logAudit({
        tenantId,
        action: 'billing.checkout_completed',
        resource: 'subscription',
        resourceId: subscriptionId,
        metadata: { customerId, eventId: event.id },
      });

      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as any;
      const subscriptionId = (invoice.subscription as string) || invoice.parent?.subscription_details?.subscription;
      if (!subscriptionId) break;

      await db.update(subscriptions)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

      const sub = await db.query.subscriptions.findFirst({
        where: (s, { eq }) => eq(s.stripeSubscriptionId, subscriptionId),
      });
      if (sub) {
        await logAudit({
          tenantId: sub.tenantId,
          action: 'billing.invoice_paid',
          resource: 'subscription',
          resourceId: subscriptionId,
          metadata: { eventId: event.id },
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as any;
      const subscriptionId = (invoice.subscription as string) || invoice.parent?.subscription_details?.subscription;
      if (!subscriptionId) break;

      await db.update(subscriptions)
        .set({ status: 'past_due', updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

      const sub = await db.query.subscriptions.findFirst({
        where: (s, { eq }) => eq(s.stripeSubscriptionId, subscriptionId),
      });
      if (sub) {
        await logAudit({
          tenantId: sub.tenantId,
          action: 'billing.payment_failed',
          resource: 'subscription',
          resourceId: subscriptionId,
          metadata: { eventId: event.id },
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;

      const [updated] = await db.update(subscriptions)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
        .returning();

      if (updated) {
        await db.update(tenants)
          .set({ status: 'suspended', updatedAt: new Date() })
          .where(eq(tenants.id, updated.tenantId));

        await logAudit({
          tenantId: updated.tenantId,
          action: 'billing.subscription_canceled',
          resource: 'subscription',
          resourceId: subscription.id,
          metadata: { eventId: event.id },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
