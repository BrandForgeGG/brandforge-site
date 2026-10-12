import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addCarouselChannel } from '@/lib/project-db';
import { connectMeta, metaConfigured } from '@/lib/meta';
import { readUnsubscribeToken } from '@/lib/unsubscribe-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: where Meta sends the person back after they approve. Only completes for the same signed-in account that started it,
// then stores each Page (and its Instagram account) as an encrypted channel and returns to Settings.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (flag: string) => NextResponse.redirect(new URL(`/settings?meta=${flag}#integrations`, origin));
  if (!metaConfigured()) return back('unavailable');
  const code = request.nextUrl.searchParams.get('code') ?? '';
  const state = request.nextUrl.searchParams.get('state') ?? '';
  if (!code || request.nextUrl.searchParams.get('error')) return back('cancelled');

  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user || readUnsubscribeToken(state) !== user.id) return back('error');

  const connected = await connectMeta(code, origin);
  if (!connected.ok) return back('nopages');
  let saved = 0;
  for (const channel of connected.channels) {
    const result = await addCarouselChannel(user.id, channel);
    if (result.ok) saved += 1;
    else if (result.error === 'limit') return back(saved > 0 ? 'connected' : 'limit');
  }
  return back('connected');
}
