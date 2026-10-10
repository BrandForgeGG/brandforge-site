import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getActiveSubscription } from '@/lib/project-db';
import { getRetainer } from '@/lib/plans.js';

export const dynamic = 'force-dynamic';

// GET: the signed-in person's monthly plan, if they have one.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ plan: null }, { status: 401 });
  const subscription = await getActiveSubscription(user.id);
  const plan = subscription ? getRetainer(subscription.plan) : null;
  return NextResponse.json({ plan: subscription && plan ? { id: plan.id, name: plan.name, price: plan.price, status: subscription.status, renews: subscription.currentPeriodEnd } : null });
}
