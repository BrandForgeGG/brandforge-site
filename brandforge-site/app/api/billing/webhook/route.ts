import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/stripe-signature';
import { getAgreementById, recordFunnelEvent, upsertSubscription } from '@/lib/project-db';
import { completeAgreementFunding } from '@/lib/funding-complete';
import { getRetainer } from '@/lib/plans.js';
import { postOpsEvent } from '@/lib/ops-events';
import { startTeamPlan, teamPlanEnded } from '@/lib/team-plan-start';

export const dynamic = 'force-dynamic';

type StripeObject = Record<string, unknown> & { metadata?: Record<string, string> };

const str = (value: unknown) => (typeof value === 'string' && value ? value : null);
// An invoice carries its subscription's metadata in subscription_details (older API) or parent.subscription_details (newer).
function subscriptionMeta(invoice: StripeObject): Record<string, string> {
  const direct = (invoice.subscription_details as { metadata?: Record<string, string> } | undefined)?.metadata;
  const parent = ((invoice.parent as { subscription_details?: { metadata?: Record<string, string> } } | undefined)?.subscription_details)?.metadata;
  return direct ?? parent ?? {};
}
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

  if (event.type === 'checkout.session.completed' && !str(object.subscription) && str(object.metadata?.agreement_id)) {
    // A funded task or project paid once by card: the same funding path as crypto and staff checks.
    const agreement = await getAgreementById(str(object.metadata?.agreement_id) as string);
    if (agreement && agreement.status === 'pending_funding' && object.payment_status === 'paid') {
      await completeAgreementFunding({ id: agreement.id, conversation_id: agreement.conversation_id, total_amount: agreement.total_amount, currency: agreement.currency ?? 'EUR' }, 'card');
    }
  } else if (event.type === 'checkout.session.completed') {
    const subscriptionId = str(object.subscription);
    if (subscriptionId) {
      const plan = str(object.metadata?.plan);
      await upsertSubscription({ stripeSubscriptionId: subscriptionId, userId: str(object.client_reference_id) ?? str(object.metadata?.user_id), plan, status: 'active', stripeCustomerId: str(object.customer) });
      await recordFunnelEvent('subscription_active', { signedIn: true, properties: { source: plan ?? 'unknown' } });
      const named = plan ? getRetainer(plan) : null;
      await postOpsEvent('plan_requested', { title: `PAID: ${named ? named.name + ' ' + named.price + named.cadence : 'a plan'}` });
      await startTeamPlan(str(object.client_reference_id) ?? str(object.metadata?.user_id), plan, 'card');
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const id = str(object.id);
    if (id) {
      await upsertSubscription({ stripeSubscriptionId: id, userId: str(object.metadata?.user_id), plan: str(object.metadata?.plan), status: event.type === 'customer.subscription.deleted' ? 'canceled' : (str(object.status) ?? 'active'), stripeCustomerId: str(object.customer), currentPeriodEnd: periodEnd(object.current_period_end) });
      // A team plan ending is the moment to keep the client: the team is told in that client's chat.
      if (event.type === 'customer.subscription.deleted') await teamPlanEnded(str(object.metadata?.user_id), str(object.metadata?.plan));
    }
  } else if (event.type === 'invoice.paid' && object.billing_reason === 'subscription_cycle') {
    // A team plan renewed: the next month starts in the client's chat (the first month is checkout.session.completed).
    const meta = subscriptionMeta(object);
    await startTeamPlan(meta.user_id ?? null, meta.plan ?? null, 'card');
  } else if (event.type === 'invoice.payment_failed') {
    const id = str(object.subscription);
    if (id) await upsertSubscription({ stripeSubscriptionId: id, status: 'past_due' });
  }
  return NextResponse.json({ received: true });
}
