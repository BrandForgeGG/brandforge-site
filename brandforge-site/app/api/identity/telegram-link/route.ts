import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { createTelegramLinkToken, buildTelegramDeepLink, LINK_TOKEN_TTL_SECONDS } from '@/lib/identity';

export const dynamic = 'force-dynamic';

// Issues a short-lived, HMAC-signed deep link for the signed-in member: the bot handle plus a
// one-time token bound to this user id. The token is signed server-side with a secret the browser
// never sees, so the chat id that comes back can only ever be attached to the account that asked
// for it -- a member cannot claim someone else's Telegram, and cannot pass a hand-picked chat id.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = createTelegramLinkToken(user.id, process.env.TELEGRAM_LINK_SECRET);

    if (!token) {
      // Refusing is the safe outcome: a token signed with a guessable key would be worse than
      // no linking at all, so we report the configuration gap instead of degrading silently.
      return NextResponse.json(
        { error: 'Telegram linking is not configured yet. Please try again later.' },
        { status: 503 },
      );
    }

    const deepLink = buildTelegramDeepLink(
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
      token,
    );

    if (!deepLink) {
      return NextResponse.json(
        { error: 'Telegram bot is not configured yet. Please try again later.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ deepLink, expiresInSeconds: LINK_TOKEN_TTL_SECONDS });
  } catch (error) {
    console.error('Telegram link error:', error);
    return NextResponse.json({ error: 'Failed to create Telegram link' }, { status: 500 });
  }
}