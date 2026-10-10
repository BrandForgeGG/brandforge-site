import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getActiveSubscription } from '@/lib/project-db';
import { createPortalUrl, stripeConfigured } from '@/lib/stripe';
import { resolveSiteUrl } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

// GET: Stripe's page for changing the card or cancelling.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const subscription = await getActiveSubscription(user.id);
  if (!stripeConfigured() || !subscription?.stripeCustomerId) return NextResponse.json({ error: 'No card plan to manage.' }, { status: 404 });
  const url = await createPortalUrl(subscription.stripeCustomerId, resolveSiteUrl());
  return url ? NextResponse.json({ url }) : NextResponse.json({ error: 'Could not open billing. Try again.' }, { status: 502 });
}
