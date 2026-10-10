import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { recordFunnelEvent } from '@/lib/project-db';
import { createCheckoutUrl, stripeConfigured } from '@/lib/stripe';
import { checkRateLimit } from '@/lib/rate-limit';
import { resolveSiteUrl } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

// POST { plan }: start a card payment for a monthly team plan. Needs a signed-in account (the plan belongs to someone).
export async function POST(request: NextRequest) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'Card payment is not open yet. Ask for the plan in the chat.', code: 'not_configured' }, { status: 503 });
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to subscribe.', code: 'auth' }, { status: 401 });
  if (!checkRateLimit(`checkout:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const url = await createCheckoutUrl({ planId: String(body.plan ?? ''), userId: user.id, email: user.email ?? null, origin: resolveSiteUrl() });
  if (!url) return NextResponse.json({ error: 'That plan cannot be paid by card. Ask for it in the chat.' }, { status: 400 });
  await recordFunnelEvent('checkout_started', { signedIn: true, properties: { source: String(body.plan ?? '') } });
  return NextResponse.json({ url });
}
