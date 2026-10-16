import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { tierOf } from '@/lib/ai-tier';
import { bumpMonthlyUsage, getMonthlyUsage, isStaffAccount, listCarouselChannels, recordFunnelEvent } from '@/lib/project-db';
import { allowance, limitMessage, monthKey, FREE_LIMITS } from '@/lib/free-limits.js';

type Gate = { ok: true; count: () => Promise<void> } | { ok: false; response: NextResponse };

/** The 402 every limited route answers with; the site-wide upgrade prompt reads `code` and `kind`. */
export function limitResponse(kind: 'creation' | 'video' | 'channel', tier = 'free'): NextResponse {
  void recordFunnelEvent('free_limit_reached', { properties: { source: kind } }).catch(() => undefined);
  return NextResponse.json({ error: limitMessage(kind, tier), code: 'limit', kind, tier, limit: FREE_LIMITS[kind] }, { status: 402 });
}

function addressKey(request: NextRequest): string {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  return `ip:${ip || 'unknown'}`;
}

/**
 * Checks the Free monthly allowance for one AI creation or one video before the work starts. Signed-in people count by
 * account, signed-out visitors by address. Call `count()` only after the work succeeded, so a failed try is free.
 */
export async function freeGate(request: NextRequest, kind: 'creation' | 'video'): Promise<Gate> {
  const user = await getAuthenticatedUser(request).catch(() => null);
  const paid = user ? await tierOf(user.id) : 'free';
  const tier = user && paid === 'pro' && (await isStaffAccount(user.id).catch(() => false)) ? 'staff' : paid;
  if (allowance(kind, 0, tier).limit === null) return { ok: true, count: async () => undefined };
  const key = user ? `u:${user.id}` : addressKey(request);
  const month = monthKey();
  const used = await getMonthlyUsage(key, month, kind);
  if (!allowance(kind, used, tier).ok) return { ok: false, response: limitResponse(kind, tier) };
  return { ok: true, count: () => bumpMonthlyUsage(key, month, kind) };
}

/** Whether a Free account may link one more channel (paying accounts and staff always may). */
export async function channelAllowed(userId: string): Promise<boolean> {
  if ((await tierOf(userId)) === 'pro') return true;
  const linked = await listCarouselChannels(userId).catch(() => []);
  return allowance('channel', linked.length, 'free').ok;
}

/** Runs a making route inside the Free allowance: refused with the upgrade answer when used up, counted only when it worked. */
export async function withFreeGate(request: NextRequest, kind: 'creation' | 'video', run: () => Promise<NextResponse>): Promise<NextResponse> {
  const gate = await freeGate(request, kind);
  if (!gate.ok) return gate.response;
  const response = await run();
  if (response.ok) await gate.count();
  return response;
}
