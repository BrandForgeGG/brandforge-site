import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { linkTelegramAsVerifiedBot, listTelegramLinkCandidates } from '@/lib/project-db';
import {
  verifyTelegramLinkToken,
  verifyTelegramLinkCode,
  normalizeTelegramUsername,
  isTelegramChatId,
} from '@/lib/identity';

export const dynamic = 'force-dynamic';

// Called by the BrandForge bot when a member pastes their link code (or opens a legacy
// deep link). This is the only place a Telegram chat id is ever written to a profile,
// and it is safe because:
//
//   1. The caller must prove it is our bot via a shared secret (constant-time compared),
//      so a random request cannot attach a chat id to anyone's account.
//   2. The credential it presents — a pasted code or a token — proves it was generated
//      for exactly one user id, so the chat id lands on the account that asked for it,
//      never on a caller-supplied one.
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
      code?: unknown;
      chatId?: unknown;
      telegramUsername?: unknown;
    };

    let verification: { ok: boolean; reason?: string; userId?: string };

    if (typeof body.code === 'string' && body.code.trim()) {
      // Paste-code flow: recompute the member's current code and compare against every
      // account (constant work, no early exit). Zero candidates = fail closed.
      const candidates = await listTelegramLinkCandidates();
      verification = verifyTelegramLinkCode(
        body.code,
        candidates,
        process.env.TELEGRAM_LINK_SECRET,
      );
    } else {
      verification = verifyTelegramLinkToken(
        typeof body.token === 'string' ? body.token : '',
        process.env.TELEGRAM_LINK_SECRET,
      );
    }

    if (!verification.ok) {
      const reason =
        verification.reason === 'expired_token'
          ? 'This link has expired. Please generate a new one in the app.'
          : verification.reason === 'unknown_code' || verification.reason === 'malformed_code'
            ? 'That code is not valid. Please generate a new one in the app.'
            : 'This link is not valid. Please generate a new one in the app.';
      return NextResponse.json({ error: reason }, { status: 400 });
    }

    if (!isTelegramChatId(body.chatId)) {
      return NextResponse.json({ error: 'Invalid Telegram chat id' }, { status: 400 });
    }

    // The caller has no session of its own and the profile belongs to the user bound to
    // the credential, so the user-scoped client cannot make this write. The data layer
    // performs it with the admin client, and owns the ownership check (the verification
    // above) and the best-effort username backfill.
    const result = await linkTelegramAsVerifiedBot(
      verification.userId ?? '',
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