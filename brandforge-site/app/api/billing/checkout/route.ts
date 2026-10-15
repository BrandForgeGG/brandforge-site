import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { recordFunnelEvent } from '@/lib/project-db';
import { createCheckoutUrl } from '@/lib/stripe';
import { getPaidPlan } from '@/lib/plans.js';
import { paymentStatus } from '@/lib/payments-open';
import { checkRateLimit } from '@/lib/rate-limit';
import { resolveSiteUrl } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

// POST { plan }: start a card payment for a monthly plan (Pro or a team plan). Needs a signed-in account (the plan belongs to someone).
export async function POST(request: NextRequest) {
  // Card checkout needs the card keys; crypto has its own checkout (/api/crypto/invoice).
  const status = paymentStatus();
  if (!status.open || !status.card) return NextResponse.json({ error: status.crypto ? 'Card payments are not connected yet. Pay with crypto instead.' : 'Payments open soon. Ask for the plan in the chat and we will start you today.', code: 'locked' }, { status: 503 });
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to subscribe.', code: 'auth' }, { status: 401 });
  if (!checkRateLimit(`checkout:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const plan = getPaidPlan(String(body.plan ?? ''));
  if (!plan || plan.cents <= 0) return NextResponse.json({ error: 'That plan cannot be paid by card. Ask for it in the chat.' }, { status: 400 });
  const url = await createCheckoutUrl({ planId: plan.id, userId: user.id, email: user.email ?? null, origin: resolveSiteUrl() });
  // A valid plan that still gets no checkout page means Stripe refused (the reason is in the server log).
  if (!url) return NextResponse.json({ error: status.crypto ? 'Card payment could not start right now. Try again in a moment, or pay with crypto.' : 'Card payment could not start right now. Try again in a moment.' }, { status: 502 });
  await recordFunnelEvent('checkout_started', { signedIn: true, properties: { source: String(body.plan ?? '') } });
  return NextResponse.json({ url });
}
