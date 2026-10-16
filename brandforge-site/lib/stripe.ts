import { getPaidPlan, getRetainer } from '@/lib/plans.js';

// Card subscriptions through Stripe, over plain HTTP so there is nothing extra to install. The whole thing is dormant
// until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set: with no key, the pricing page offers the chat instead.

const API = 'https://api.stripe.com/v1';

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

async function stripePost(path: string, params: URLSearchParams): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      console.error('Stripe error:', path, response.status, JSON.stringify((data as { error?: unknown } | null)?.error ?? '').slice(0, 300));
      return null;
    }
    return data;
  } catch (error) {
    console.error('Stripe request failed:', path, error instanceof Error ? error.message : error);
    return null;
  }
}

// A monthly plan, paid by card. Returns the page Stripe hosts for the payment.
export async function createCheckoutUrl(input: { planId: string; userId: string; email: string | null; origin: string; chatId?: string | null }): Promise<string | null> {
  const plan = getPaidPlan(input.planId);
  if (!plan || plan.cents <= 0) return null;
  const params = new URLSearchParams({
    mode: 'subscription',
    // A team plan lands in the chat, where its team chat appears as soon as Stripe confirms the payment.
    success_url: input.chatId ? `${input.origin}/chat?conversationId=${input.chatId}` : getRetainer(plan.id) ? `${input.origin}/chat?paid=team` : `${input.origin}/settings?plan=thanks`,
    cancel_url: input.chatId ? `${input.origin}/chat?conversationId=${input.chatId}` : `${input.origin}/pricing`,
    client_reference_id: input.userId,
    'metadata[plan]': plan.id,
    'metadata[user_id]': input.userId,
    'subscription_data[metadata][plan]': plan.id,
    'subscription_data[metadata][user_id]': input.userId,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(plan.cents),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': `BrandForge ${plan.name} (monthly)`,
    allow_promotion_codes: 'true',
  });
  if (input.email) params.set('customer_email', input.email);
  const session = await stripePost('/checkout/sessions', params);
  return typeof session?.url === 'string' ? session.url : null;
}

// Where a customer changes the card or cancels: Stripe's own page.
export async function createPortalUrl(customerId: string, origin: string): Promise<string | null> {
  const session = await stripePost('/billing_portal/sessions', new URLSearchParams({ customer: customerId, return_url: `${origin}/settings` }));
  return typeof session?.url === 'string' ? session.url : null;
}

// One payment for a funded task or project (an agreement): the buyer pays once by card, BrandForge holds it and releases it
// when the buyer approves the work. The webhook funds the agreement from metadata.agreement_id.
export async function createTaskCheckoutUrl(input: { agreementId: string; cents: number; title: string; userId: string; email: string | null; origin: string; chatId: string }): Promise<string | null> {
  if (!Number.isInteger(input.cents) || input.cents < 100) return null;
  const params = new URLSearchParams({
    mode: 'payment',
    success_url: `${input.origin}/chat?conversationId=${input.chatId}`,
    cancel_url: `${input.origin}/chat?conversationId=${input.chatId}`,
    client_reference_id: input.userId,
    'metadata[agreement_id]': input.agreementId,
    'metadata[user_id]': input.userId,
    'payment_intent_data[metadata][agreement_id]': input.agreementId,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(input.cents),
    'line_items[0][price_data][product_data][name]': `BrandForge task: ${input.title.slice(0, 80)}`,
  });
  if (input.email) params.set('customer_email', input.email);
  const session = await stripePost('/checkout/sessions', params);
  return typeof session?.url === 'string' ? session.url : null;
}
