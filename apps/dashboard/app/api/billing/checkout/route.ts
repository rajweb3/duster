import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

const PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_duster_standard_monthly';

export async function POST(request: Request) {
  const headersList = headers();
  const tenantId = headersList.get('x-tenant-id');
  const userId = headersList.get('x-user-id');

  if (!tenantId || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { successUrl, cancelUrl } = await request.json();

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      metadata: { tenantId, userId },
      success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/overview?checkout=success`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/onboarding?checkout=canceled`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
