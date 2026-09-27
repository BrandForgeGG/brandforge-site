import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { verifyTelegramLinkToken } from '@/lib/identity';

export const dynamic = 'force-dynamic';

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

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const update = await request.json();

    const message = update.message;
    const callbackQuery = update.callback_query;

    if (callbackQuery) {
      const data = String(callbackQuery.data ?? '');
      if (data.startsWith('link:')) {
        const token = data.slice(5);
        const chatId = String(callbackQuery.message?.chat?.id ?? '');

        const verification = verifyTelegramLinkToken(
          token,
          process.env.TELEGRAM_LINK_SECRET,
        );

        if (!verification.ok) {
          await callTelegramApi('answerCallbackQuery', {
            callback_query_id: callbackQuery.id,
            text: 'This link has expired. Please generate a new one in the app.',
            show_alert: true,
          });
          return NextResponse.json({ ok: true });
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brandforge.gg'}/api/identity/telegram-link/confirm`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-brandforge-bot-secret': process.env.TELEGRAM_LINK_SECRET ?? '',
            },
            body: JSON.stringify({
              token,
              chatId,
              telegramUsername: callbackQuery.from?.username ?? null,
            }),
            signal: AbortSignal.timeout(10000),
          },
        );

        if (response.ok) {
          await callTelegramApi('editMessageText', {
            chat_id: callbackQuery.message?.chat?.id,
            message_id: callbackQuery.message?.message_id,
            text: 'Your Telegram account is linked. You will now receive project updates here.',
          });
          await callTelegramApi('answerCallbackQuery', {
            callback_query_id: callbackQuery.id,
            text: 'Account linked successfully.',
          });
        } else {
          await callTelegramApi('answerCallbackQuery', {
            callback_query_id: callbackQuery.id,
            text: 'Could not link your account. Please try again.',
            show_alert: true,
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const text = String(message.text ?? '');
    const chatId = String(message.chat?.id ?? '');

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const token = parts[1] ?? '';

      if (token) {
        const verification = verifyTelegramLinkToken(
          token,
          process.env.TELEGRAM_LINK_SECRET,
        );

        if (verification.ok) {
          await callTelegramApi('sendMessage', {
            chat_id: chatId,
            text: 'Link your BrandForge account to this Telegram chat.\n\nWe ask for this so we can send you project updates, milestone notifications, and payment confirmations directly here — no email needed.',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Yes, link my account',
                    callback_data: `link:${token}`,
                  },
                ],
              ],
            },
          });
        } else {
          await callTelegramApi('sendMessage', {
            chat_id: chatId,
            text: 'This link has expired or is not valid. Please open a new link from the BrandForge app.',
          });
        }
      } else {
        await callTelegramApi('sendMessage', {
          chat_id: chatId,
          text: 'Welcome to BrandForge. Open the app and go to Settings to link your Telegram account.',
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
