import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/stripe-signature';
import { recordFunnelEvent, upsertSubscription } from '@/lib/project-db';
import { getRetainer } from '@/lib/plans.js';
import { postOpsEvent } from '@/lib/ops-events';

export const dynamic = 'force-dynamic';

type StripeObject = Record<string, unknown> & { metadata?: Record<string, string> };

const str = (value: unknown) => (typeof value === 'string' && value ? value : null);
const periodEnd = (value: unknown) => (typeof value === 'number' ? new Date(value * 1000).toISOString() : null);

// Stripe calls this when money moves. It is trusted only when the signature checks out.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }
  let event: { type?: string; data?: { object?: StripeObject } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad body' }, { status: 400 });
  }
  const object = event.data?.object;
  if (!object) return NextResponse.json({ received: true });

  if (event.type === 'checkout.session.completed') {
    const subscriptionId = str(object.subscription);
    if (subscriptionId) {
      const plan = str(object.metadata?.plan);
      await upsertSubscription({ stripeSubscriptionId: subscriptionId, userId: str(object.client_reference_id) ?? str(object.metadata?.user_id), plan, status: 'active', stripeCustomerId: str(object.customer) });
      await recordFunnelEvent('subscription_active', { signedIn: true, properties: { source: plan ?? 'unknown' } });
      const named = plan ? getRetainer(plan) : null;
      await postOpsEvent('plan_requested', { title: `PAID: ${named ? named.name + ' ' + named.price + named.cadence : 'a plan'}` });
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const id = str(object.id);
    if (id) {
      await upsertSubscription({ stripeSubscriptionId: id, userId: str(object.metadata?.user_id), plan: str(object.metadata?.plan), status: event.type === 'customer.subscription.deleted' ? 'canceled' : (str(object.status) ?? 'active'), stripeCustomerId: str(object.customer), currentPeriodEnd: periodEnd(object.current_period_end) });
    }
  } else if (event.type === 'invoice.payment_failed') {
    const id = str(object.subscription);
    if (id) await upsertSubscription({ stripeSubscriptionId: id, status: 'past_due' });
  }
  return NextResponse.json({ received: true });
}
