import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { tumblrAuthorizeUrl, tumblrConfigured } from '@/lib/tumblr';
import { makeUnsubscribeToken } from '@/lib/unsubscribe-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: sends a signed-in person to Tumblr's own page to approve BrandForge. The state is signed with the
// person's id, so the way back can only complete for the same signed-in account.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (flag: string) => NextResponse.redirect(new URL(`/settings?tumblr=${flag}#integrations`, origin));
  if (!tumblrConfigured()) return back('unavailable');
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.redirect(new URL('/login?next=/settings%23integrations', origin));
  const state = makeUnsubscribeToken(user.id);
  if (!state) return back('error');
  return NextResponse.redirect(tumblrAuthorizeUrl(state, origin));
}
