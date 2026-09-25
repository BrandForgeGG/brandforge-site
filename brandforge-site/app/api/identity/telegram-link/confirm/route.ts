import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { linkTelegramAsVerifiedBot } from '@/lib/project-db';
import {
  verifyTelegramLinkToken,
  normalizeTelegramUsername,
  isTelegramChatId,
} from '@/lib/identity';

export const dynamic = 'force-dynamic';

// Called by the BrandForge bot after a member opens the deep link and presses Start. This is the
// only place a Telegram chat id is ever written to a profile, and it is safe because:
//
//   1. The caller must prove it is our bot via a shared secret (constant-time compared), so a
//      random request cannot attach a chat id to anyone's account.
//   2. The token it presents is HMAC-signed, unexpired, and bound to exactly one user id, so the
//      chat id lands on the account that generated the link -- never on a caller-supplied one.
//   3. The chat id is format-checked before it reaches the database.
//
// Together these mean a member can only ever link the Telegram account they control.
function isBotRequest(request: NextRequest): boolean {
  const expected = String(process.env.TELEGRAM_LINK_SECRET ?? '').trim();
  const provided = String(request.headers.get('x-brandforge-bot-secret') ?? '').trim();

  if (!expected || !provided) {
    return false;
  }

  // Hash both sides first so the comparison is constant-time for any input length.
  const left = crypto.createHash('sha256').update(provided).digest();
  const right = crypto.createHash('sha256').update(expected).digest();

  return crypto.timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  try {
    if (!isBotRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      token?: unknown;
      chatId?: unknown;
      telegramUsername?: unknown;
    };

    const verification = verifyTelegramLinkToken(
      typeof body.token === 'string' ? body.token : '',
      process.env.TELEGRAM_LINK_SECRET,
    );

    if (!verification.ok) {
      return NextResponse.json({ error: 'Link token is not valid' }, { status: 400 });
    }

    if (!isTelegramChatId(body.chatId)) {
      return NextResponse.json({ error: 'Invalid Telegram chat id' }, { status: 400 });
    }

    // The caller has no session of its own and the profile belongs to the user encoded in the
    // token, so the user-scoped client cannot make this write. The data layer performs it with
    // the admin client, and owns the ownership check (the token verification above) and the
    // best-effort username backfill.
    const result = await linkTelegramAsVerifiedBot(
      verification.userId,
      String(body.chatId).trim(),
      normalizeTelegramUsername(body.telegramUsername) || null,
    );

    if (!result.ok) {
      if (result.reason === 'unavailable') {
        return NextResponse.json({ error: 'Linking is not available right now' }, { status: 503 });
      }

      if (result.reason === 'taken') {
        return NextResponse.json(
          { error: 'That Telegram account is already linked elsewhere.' },
          { status: 409 },
        );
      }

      return NextResponse.json({ error: 'Could not link Telegram.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram link confirm error:', error);
    return NextResponse.json({ error: 'Failed to link Telegram' }, { status: 500 });
  }
}