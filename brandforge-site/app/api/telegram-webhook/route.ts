import { after, NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { normalizeLinkCode, LINK_CODE_LENGTH } from '@/lib/identity';
import { handleTelegramCallback, handleTelegramMessage, sendMenu, BOT_WELCOME } from '@/lib/telegram-bot';
import { kindFromPrompt, looksLikeLinkCode, parseCommand } from '@/lib/bot-core.js';

export const dynamic = 'force-dynamic';
// The bot answers after Telegram has been acknowledged; give it room to finish a full turn.
export const maxDuration = 60;

const BOT_TOKEN = () => String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();

function isAuthorized(request: NextRequest): boolean {
  const secret = String(process.env.TELEGRAM_LINK_SECRET ?? '').trim();
  // Telegram sends X-Telegram-Bot-Api-Secret-Token (set via setWebhook secret_token).
  const provided = String(
    request.headers.get('x-telegram-bot-api-secret-token') ?? '',
  ).trim();

  if (!secret || !provided) {
    return false;
  }

  const left = crypto.createHash('sha256').update(provided).digest();
  const right = crypto.createHash('sha256').update(secret).digest();

  return crypto.timingSafeEqual(left, right);
}

async function callTelegramApi(method: string, body: Record<string, unknown>) {
  const token = BOT_TOKEN();
  if (!token) return null;

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  return response.json();
}

// Asks our own confirm endpoint to perform the link: it holds the bot-secret check and
// the code/token verification, so the webhook never touches the database directly.
async function confirmLink(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brandforge.gg'}/api/identity/telegram-link/confirm`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-brandforge-bot-secret': process.env.TELEGRAM_LINK_SECRET ?? '',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      },
    );

    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: response.ok, error: data.error };
  } catch {
    return { ok: false, error: 'Could not link your account right now. Please try again.' };
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const update = await request.json().catch(() => null);

    // Garbage in: acknowledge so Telegram stops retrying the delivery.
    if (!update || typeof update !== 'object') {
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    const callbackQuery = update.callback_query;

    // Menu and follow-up buttons. The work runs after Telegram has been answered.
    if (callbackQuery) {
      const callbackChat = String(callbackQuery.message?.chat?.id ?? '');
      const callbackUser = String(callbackQuery.from?.id ?? '');
      if (callbackChat && callbackUser) {
        after(async () => {
          await handleTelegramCallback({ callbackId: String(callbackQuery.id), chatId: callbackChat, userId: callbackUser, data: String(callbackQuery.data ?? '') });
        });
      } else {
        await callTelegramApi('answerCallbackQuery', { callback_query_id: callbackQuery.id });
      }
      return NextResponse.json({ ok: true });
    }

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const text = String(message.text ?? '');
    const chatId = String(message.chat?.id ?? '');
    const from = message.from ?? {};

    if (!text || !chatId) {
      return NextResponse.json({ ok: true });
    }

    const command = parseCommand(text);
    const isPrivate = message.chat?.type === 'private';

    if (command && (command.name === 'start' || command.name === 'help' || command.name === 'menu')) {
      await sendMenu(chatId, BOT_WELCOME);
      return NextResponse.json({ ok: true });
    }

    // Account linking: the "Link my account" button asks for the code and this is its answer;
    // "/link CODE" and a pasted code on its own still work.
    const replyToText = message.reply_to_message?.text ?? null;
    const isLinkReply = kindFromPrompt(replyToText) === 'link';
    const isLinkCommand = command?.name === 'link';
    const pasted = isLinkReply ? text : isLinkCommand ? command!.args : looksLikeLinkCode(text) ? text : '';
    if (!pasted) {
      // Everything else is a BrandForge request. Answer after acknowledging Telegram.
      const userId = String(from.id ?? '');
      if (userId) {
        after(async () => {
          await handleTelegramMessage({ chatId, userId, text, isPrivate, replyToText });
        });
      }
      return NextResponse.json({ ok: true });
    }

    const code = normalizeLinkCode(pasted);

    if (code.length !== LINK_CODE_LENGTH) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: `That does not look like a link code. Codes are ${LINK_CODE_LENGTH} characters, like “k7m2q9xd” — generate one in the BrandForge app and paste it here.`,
      });
      return NextResponse.json({ ok: true });
    }

    const result = await confirmLink({
      code,
      chatId,
      telegramUsername: from.username ?? null,
    });

    if (result.ok) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: 'Linked. You will now receive project updates, milestone notifications and payment confirmations here.',
      });
    } else {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: `${result.error ?? 'That code is not valid.'} Open Settings, press “Connect Telegram” for a fresh code, and paste it here.`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
