import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addCarouselChannel } from '@/lib/project-db';
import { connectTumblr, tumblrConfigured } from '@/lib/tumblr';
import { readUnsubscribeToken } from '@/lib/unsubscribe-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: where Tumblr sends the person back after they approve. Only completes for the same signed-in
// account that started it, then stores the encrypted token and returns to Settings.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (flag: string) => NextResponse.redirect(new URL(`/settings?tumblr=${flag}#integrations`, origin));
  if (!tumblrConfigured()) return back('unavailable');
  const code = request.nextUrl.searchParams.get('code') ?? '';
  const state = request.nextUrl.searchParams.get('state') ?? '';
  if (!code || request.nextUrl.searchParams.get('error')) return back('cancelled');

  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user || readUnsubscribeToken(state) !== user.id) return back('error');

  const connected = await connectTumblr(code, origin);
  if (!connected.ok) return back('error');
  const saved = await addCarouselChannel(user.id, { kind: 'tumblr', label: connected.label, secret: connected.secret, meta: { blog: connected.blog } });
  if (!saved.ok && saved.error !== 'duplicate') return back('error');
  return back('connected');
}
