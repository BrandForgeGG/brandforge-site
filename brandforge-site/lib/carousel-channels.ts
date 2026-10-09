import { createCanvas, loadImage } from '@napi-rs/canvas';
import { decryptSecret, encryptSecret } from '@/lib/secret-box.js';
import { postCarouselToDiscordWebhook, postCarouselToTelegram, type PublishResult } from '@/lib/carousel-publish';
import { getUserNotifyTargets, type CarouselChannelRow } from '@/lib/project-db';
import { postCarouselToTumblr } from '@/lib/tumblr';

// Linking a channel and posting to it. Only platforms that need no app approval are here: a Telegram
// channel (the person must be its admin), a Discord channel webhook, and Bluesky (an app password the
// person can revoke at any time). Secrets are encrypted before they are stored and never sent back.
export type LinkResult = { ok: true; kind: CarouselChannelRow['kind']; label: string; secret: string | null; meta: Record<string, unknown> } | { ok: false; error: string };

const BSKY = 'https://bsky.social/xrpc';

function tgToken(): string {
  return String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
}

async function tg<T>(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${tgToken()}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    return (await res.json()) as { ok: boolean; result?: T; description?: string };
  } catch {
    return { ok: false, description: 'Could not reach Telegram.' };
  }
}

export function normalizeTelegramHandle(raw: string): string | null {
  const text = String(raw ?? '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(text) ? `@${text}` : null;
}

export async function linkTelegramChannel(userId: string, raw: string): Promise<LinkResult> {
  if (!tgToken()) return { ok: false, error: 'Telegram is not set up on this site yet.' };
  const handle = normalizeTelegramHandle(raw);
  if (!handle) return { ok: false, error: 'Enter the channel as @yourchannel.' };

  const mine = (await getUserNotifyTargets(userId)).telegramChatId;
  if (!mine) return { ok: false, error: 'Link your Telegram account first (Settings, Connect Telegram), so we can check you run that channel.' };

  const chat = await tg<{ id: number; title?: string; type: string }>('getChat', { chat_id: handle });
  if (!chat.ok || !chat.result) return { ok: false, error: 'That channel was not found. Check the name, and make sure it is public.' };
  if (!['channel', 'supergroup', 'group'].includes(chat.result.type)) return { ok: false, error: 'That is not a channel or group.' };

  const me = await tg<{ id: number }>('getMe', {});
  const botMember = me.result ? await tg<{ status: string; can_post_messages?: boolean }>('getChatMember', { chat_id: chat.result.id, user_id: me.result.id }) : null;
  const botOk = botMember?.ok && botMember.result && (botMember.result.status === 'creator' || (botMember.result.status === 'administrator' && botMember.result.can_post_messages !== false));
  if (!botOk) return { ok: false, error: 'Add @brandforge_bot to that channel as an administrator that can post messages, then try again.' };

  const you = await tg<{ status: string }>('getChatMember', { chat_id: chat.result.id, user_id: Number(mine) });
  if (!you.ok || !you.result || !['creator', 'administrator'].includes(you.result.status)) return { ok: false, error: 'Only a channel administrator can link it. Your linked Telegram account is not an admin there.' };

  return { ok: true, kind: 'telegram', label: handle, secret: null, meta: { chatId: String(chat.result.id), title: chat.result.title ?? handle } };
}

export async function linkDiscordWebhook(raw: string): Promise<LinkResult> {
  const url = String(raw ?? '').trim().replace(/\?.*$/, '');
  if (!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) return { ok: false, error: 'Paste the full webhook address from Discord (Edit Channel, Integrations, Webhooks, Copy Webhook URL).' };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, error: 'Discord did not accept that webhook. Check that it still exists.' };
    const info = (await res.json()) as { name?: string; channel_id?: string };
    return { ok: true, kind: 'discord', label: `Discord: ${String(info.name ?? 'webhook').slice(0, 40)}`, secret: encryptSecret(url), meta: { channelId: info.channel_id ?? null } };
  } catch {
    return { ok: false, error: 'Could not reach Discord. Try again.' };
  }
}

export async function blueskySession(identifier: string, password: string): Promise<{ did: string; handle: string; accessJwt: string } | null> {
  try {
    const res = await fetch(`${BSKY}/com.atproto.server.createSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }), signal: AbortSignal.timeout(10000) });
    return res.ok ? ((await res.json()) as { did: string; handle: string; accessJwt: string }) : null;
  } catch {
    return null;
  }
}

const SLACK_HOOK = /^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+$/;

export async function linkSlackWebhook(raw: string): Promise<LinkResult> {
  const url = String(raw ?? '').trim().replace(/\?.*$/, '');
  if (!SLACK_HOOK.test(url)) return { ok: false, error: 'Paste the full webhook address from Slack. It starts with https://hooks.slack.com/services/.' };
  try {
    // An empty message is refused by a real webhook with "no_text" and by a missing one with a 404, so
    // nothing is ever posted while we check.
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8000) });
    const body = (await res.text().catch(() => '')).trim();
    if (!(res.status === 400 && body === 'no_text')) return { ok: false, error: 'Slack did not recognise that webhook. Check that it still exists and was copied in full.' };
    return { ok: true, kind: 'slack', label: 'Slack channel', secret: encryptSecret(url), meta: {} };
  } catch {
    return { ok: false, error: 'Could not reach Slack. Try again.' };
  }
}

export async function linkBluesky(handleRaw: string, appPassword: string): Promise<LinkResult> {
  const handle = String(handleRaw ?? '').trim().replace(/^@/, '');
  const password = String(appPassword ?? '').trim();
  if (!/^[\w.-]+\.[\w.-]+$/.test(handle)) return { ok: false, error: 'Enter your Bluesky handle, like name.bsky.social.' };
  if (!/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(password)) return { ok: false, error: 'Use an app password (Bluesky, Settings, App Passwords). Never your main password.' };
  const session = await blueskySession(handle, password);
  if (!session) return { ok: false, error: 'Bluesky did not accept that handle and app password.' };
  return { ok: true, kind: 'bluesky', label: `@${session.handle}`, secret: encryptSecret(password), meta: { handle: session.handle, did: session.did } };
}

// Bluesky takes up to four pictures a post and about 1 MB each, so slides go out as JPEG, four to a
// post, as a thread: the cover and caption first, the rest as replies.
async function toJpeg(png: Buffer): Promise<Buffer> {
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas.toBuffer('image/jpeg', 85);
}

async function postCarouselToBluesky(handle: string, password: string, images: Buffer[], caption: string): Promise<PublishResult> {
  const session = await blueskySession(handle, password);
  if (!session) return { ok: false, note: 'Bluesky did not accept the saved login. Link it again.' };
  const auth = { Authorization: `Bearer ${session.accessJwt}` };
  let root: { uri: string; cid: string } | null = null;
  let parent: { uri: string; cid: string } | null = null;
  try {
    for (let start = 0; start < images.length; start += 4) {
      const blobs: unknown[] = [];
      for (const png of images.slice(start, start + 4)) {
        const jpeg = await toJpeg(png);
        const up = await fetch(`${BSKY}/com.atproto.repo.uploadBlob`, { method: 'POST', headers: { ...auth, 'Content-Type': 'image/jpeg' }, body: new Uint8Array(jpeg), signal: AbortSignal.timeout(30000) });
        if (!up.ok) return { ok: false, note: `Bluesky refused a picture (${up.status}).` };
        blobs.push(((await up.json()) as { blob: unknown }).blob);
      }
      const text = start === 0 ? caption.slice(0, 290) : `Slides ${start + 1} to ${Math.min(images.length, start + 4)}`;
      const record: Record<string, unknown> = {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString(),
        embed: { $type: 'app.bsky.embed.images', images: blobs.map((blob, i) => ({ alt: `Carousel slide ${start + i + 1}`, image: blob })) },
        ...(root && parent ? { reply: { root, parent } } : {}),
      };
      const made = await fetch(`${BSKY}/com.atproto.repo.createRecord`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
        signal: AbortSignal.timeout(20000),
      });
      if (!made.ok) return { ok: false, note: `Bluesky refused the post (${made.status}).` };
      const created = (await made.json()) as { uri: string; cid: string };
      root = root ?? created;
      parent = created;
    }
    return { ok: true };
  } catch {
    return { ok: false, note: 'Could not reach Bluesky.' };
  }
}

export async function publishToChannel(channel: CarouselChannelRow, images: Buffer[], caption: string): Promise<PublishResult> {
  if (channel.kind === 'tumblr') return postCarouselToTumblr(channel, images, caption);
  if (channel.kind === 'telegram') return postCarouselToTelegram(String(channel.meta.chatId ?? ''), images, caption);
  const secret = channel.secret ? decryptSecret(channel.secret) : null;
  if (!secret) return { ok: false, note: 'The saved login could not be read. Link this channel again.' };
  if (channel.kind === 'discord') return postCarouselToDiscordWebhook(secret, images, caption);
  if (channel.kind === 'slack') return { ok: false, note: 'Slack cannot take pictures through a webhook. Post an update there instead.' };
  return postCarouselToBluesky(String(channel.meta.handle ?? ''), secret, images, caption);
}
