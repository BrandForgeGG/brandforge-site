import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addCarouselChannel } from '@/lib/project-db';
import { connectOAuth, isOAuthKind, oauthConfigured } from '@/lib/oauth-channels';
import { readUnsubscribeToken } from '@/lib/unsubscribe-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: where the platform sends the person back after they approve. Only completes for the same signed-in account that
// started it, then stores the encrypted token and returns to Settings.
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const origin = request.nextUrl.origin;
  if (!isOAuthKind(provider)) return NextResponse.redirect(new URL('/settings#integrations', origin));
  const back = (flag: string) => NextResponse.redirect(new URL(`/settings?${provider}=${flag}#integrations`, origin));
  if (!oauthConfigured(provider)) return back('unavailable');
  const code = request.nextUrl.searchParams.get('code') ?? '';
  const state = request.nextUrl.searchParams.get('state') ?? '';
  if (!code || request.nextUrl.searchParams.get('error')) return back('cancelled');

  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user || readUnsubscribeToken(state) !== user.id) return back('error');

  const connected = await connectOAuth(provider, code, state, origin);
  if (!connected.ok) return back('error');
  const saved = await addCarouselChannel(user.id, { kind: provider, label: connected.label, secret: connected.secret, meta: connected.meta });
  if (!saved.ok && saved.error !== 'duplicate') return back(saved.error === 'limit' ? 'limit' : 'notready');
  return back('connected');
}
