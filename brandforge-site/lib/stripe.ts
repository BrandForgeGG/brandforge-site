import { getRetainer } from '@/lib/plans.js';

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
export async function createCheckoutUrl(input: { planId: string; userId: string; email: string | null; origin: string }): Promise<string | null> {
  const plan = getRetainer(input.planId);
  if (!plan || plan.cents <= 0) return null;
  const params = new URLSearchParams({
    mode: 'subscription',
    success_url: `${input.origin}/settings?plan=thanks`,
    cancel_url: `${input.origin}/pricing`,
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
