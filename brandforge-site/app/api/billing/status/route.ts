import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getActiveSubscription } from '@/lib/project-db';
import { getPaidPlan } from '@/lib/plans.js';

export const dynamic = 'force-dynamic';

// GET: the signed-in person's monthly plan, if they have one.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ plan: null }, { status: 401 });
  const subscription = await getActiveSubscription(user.id);
  // Crypto plans have no card behind them: they run to the date paid for, then end (no automatic renewal).
  const crypto = Boolean(subscription && !subscription.stripeCustomerId);
  const lapsed = crypto && subscription?.currentPeriodEnd ? Date.parse(subscription.currentPeriodEnd) < Date.now() : false;
  const plan = subscription && !lapsed ? getPaidPlan(subscription.plan) : null;
  // Any paid plan (Pro or a team plan) also switches on the best AI for this account.
  return NextResponse.json({ plan: subscription && plan ? { id: plan.id, name: plan.name, price: plan.price, status: subscription.status, renews: subscription.currentPeriodEnd, crypto, bestAi: true } : null });
}
