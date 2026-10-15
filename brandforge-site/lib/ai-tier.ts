import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getActiveSubscription, isStaffAccount } from '@/lib/project-db';
import { budgetLimits, decideBudget } from '@/lib/ai-budget.js';
import { limitsFor, writerModels, type AiTier } from '@/lib/model-router.js';

// The AI tier of the person behind a request. Anyone paying (a software plan or a team plan, active or in its grace
// period) gets the paid tier the moment the payment lands: the strongest models first, the best pictures, ten times the
// daily allowance, and no shared cap. Routes enter the tier once (withAiTier); the services below it just ask for the
// models and the budget, so nothing has to pass the user down.

const store = new AsyncLocalStorage<{ tier: AiTier }>();
const cache = new Map<string, { at: number; tier: AiTier }>();
const TTL = 60_000;

/** 'pro' while a subscription is active (staff count as paid so they test what customers get). */
export async function tierOf(userId: string): Promise<AiTier> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.tier;
  let tier: AiTier = 'free';
  try {
    const [subscription, staff] = await Promise.all([getActiveSubscription(userId), isStaffAccount(userId)]);
    const paidThrough = subscription?.currentPeriodEnd ? Date.parse(subscription.currentPeriodEnd) : NaN;
    const current = Boolean(subscription) && (Number.isNaN(paidThrough) || paidThrough + 3 * 86_400_000 >= Date.now());
    tier = current || staff ? 'pro' : 'free';
  } catch {
    tier = 'free';
  }
  cache.set(userId, { at: Date.now(), tier });
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  return tier;
}

/** Runs a request's work inside its person's AI tier. */
export async function withAiTier<T>(request: NextRequest, run: () => Promise<T>): Promise<T> {
  const user = await getAuthenticatedUser(request).catch(() => null);
  const tier = user ? await tierOf(user.id) : 'free';
  return store.run({ tier }, run);
}

export function currentTier(): AiTier {
  return store.getStore()?.tier ?? 'free';
}

/** The writers to try for this request, best first, with any that just failed moved to the back. */
export function aiModels(): string[] {
  return writerModels(currentTier());
}

/** The daily AI budget decision for this request's tier. */
export function aiBudget(usage: { userToday: number; aiToday: number; isStaff?: boolean }) {
  const tier = currentTier();
  return decideBudget({ ...usage, paid: tier === 'pro' }, limitsFor(tier, budgetLimits(process.env)));
}
