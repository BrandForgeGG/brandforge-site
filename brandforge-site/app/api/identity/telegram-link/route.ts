import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import {
  createTelegramLinkCode,
  buildTelegramDeepLink,
  LINK_CODE_BUCKET_SECONDS,
} from '@/lib/identity';

export const dynamic = 'force-dynamic';

// Issues a short paste-into-bot link code for the signed-in member. Telegram caps the
// ?start= deep-link payload at 64 bytes, which cannot carry a signed token, so the app
// shows a short code instead: the member opens the bot and pastes it there, and the
// bot confirms it against this account. The code is an HMAC over this user id and a
// 15-minute bucket, signed with a secret the browser never sees, so the chat id that
// comes back can only ever be attached to the account that asked for the code.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const code = createTelegramLinkCode(user.id, process.env.TELEGRAM_LINK_SECRET);

    if (!code) {
      // Refusing is the safe outcome: a code that could be guessed would be worse than
      // no linking at all, so we report the configuration gap instead of degrading silently.
      return NextResponse.json(
        { error: 'Telegram linking is not configured yet. Please try again later.' },
        { status: 503 },
      );
    }

    const botUrl = buildTelegramDeepLink(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME);

    if (!botUrl) {
      return NextResponse.json(
        { error: 'Telegram bot is not configured yet. Please try again later.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ code, botUrl, expiresInSeconds: LINK_CODE_BUCKET_SECONDS });
  } catch (error) {
    console.error('Telegram link error:', error);
    return NextResponse.json({ error: 'Failed to create Telegram link' }, { status: 500 });
  }
}
