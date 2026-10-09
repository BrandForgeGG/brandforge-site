import { announceChatId } from '@/lib/telegram-announce.js';

// Sends a finished carousel (PNG images) to a channel. The same helpers serve BrandForge's own weekly
// calendar and, later, the channels people link themselves. Every send reports plainly what happened
// and never throws.
export type PublishResult = { ok: boolean; note?: string };

const BLOB = (bytes: Buffer, type = 'image/png') => new Blob([new Uint8Array(bytes)], { type });

/** A Telegram album of up to ten photos, with the caption on the first. */
export async function postCarouselToTelegram(chatId: string, images: Buffer[], caption: string, token = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim()): Promise<PublishResult> {
  if (!token) return { ok: false, note: 'No Telegram bot token is set.' };
  if (!chatId) return { ok: false, note: 'No Telegram channel is set.' };
  const photos = images.slice(0, 10);
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('media', JSON.stringify(photos.map((_, i) => ({ type: 'photo', media: `attach://slide${i}`, ...(i === 0 ? { caption: caption.slice(0, 1000) } : {}) }))));
  photos.forEach((bytes, i) => form.append(`slide${i}`, BLOB(bytes), `slide-${i + 1}.png`));
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, { method: 'POST', body: form, signal: AbortSignal.timeout(50000) });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { description?: string };
    return { ok: false, note: `Telegram said: ${String(data.description ?? res.status).slice(0, 160)}` };
  } catch {
    return { ok: false, note: 'Could not reach Telegram.' };
  }
}

/** A Discord channel message with up to ten attachments, through a webhook. */
export async function postCarouselToDiscordWebhook(webhookUrl: string, images: Buffer[], content: string): Promise<PublishResult> {
  if (!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(webhookUrl)) return { ok: false, note: 'That is not a Discord webhook address.' };
  const photos = images.slice(0, 10);
  const form = new FormData();
  form.append(
    'payload_json',
    JSON.stringify({ username: 'BrandForge', content: content.slice(0, 1800), allowed_mentions: { parse: [] }, attachments: photos.map((_, i) => ({ id: i, filename: `slide-${i + 1}.png` })) }),
  );
  photos.forEach((bytes, i) => form.append(`files[${i}]`, BLOB(bytes), `slide-${i + 1}.png`));
  try {
    const res = await fetch(`${webhookUrl}?wait=true`, { method: 'POST', body: form, signal: AbortSignal.timeout(50000) });
    if (res.ok) return { ok: true };
    return { ok: false, note: `Discord said: ${res.status}` };
  } catch {
    return { ok: false, note: 'Could not reach Discord.' };
  }
}

/** Where BrandForge's own calendar posts go. Anything not set up is reported, never guessed. */
export function ownChannels(env = process.env): { telegramChatId: string; discordWebhook: string } {
  return {
    telegramChatId: String(env.TELEGRAM_BOT_TOKEN ?? '').trim() ? announceChatId(env) : '',
    discordWebhook: String(env.DISCORD_CONTENT_URL || env.DISCORD_SHOWCASE_URL || '').trim(),
  };
}

export async function postToOwnChannels(images: Buffer[], caption: string): Promise<Record<string, PublishResult>> {
  const { telegramChatId, discordWebhook } = ownChannels();
  const results: Record<string, PublishResult> = {};
  results.telegram = telegramChatId ? await postCarouselToTelegram(telegramChatId, images, caption) : { ok: false, note: 'Not set up.' };
  results.discord = discordWebhook ? await postCarouselToDiscordWebhook(discordWebhook, images, caption) : { ok: false, note: 'No content channel webhook (DISCORD_CONTENT_URL).' };
  return results;
}
