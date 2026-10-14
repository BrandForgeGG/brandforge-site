import { encryptSecret } from '@/lib/secret-box.js';
import { assertSafeUrl } from '@/lib/research.js';
import type { PublishResult } from '@/lib/carousel-publish';
import type { CarouselChannelRow } from '@/lib/project-db';
import type { LinkResult } from '@/lib/carousel-channels';
import { stripMarkup, type Post } from '@/lib/post-types.js';

// Mastodon: free, instant, no app review. The person makes an access token in their own account (Preferences, Development)
// and pastes it with their server's address. Pictures, polls and threads all work. The server address is typed by a person,
// so it is checked as a public https address before anything is sent to it.
const MAX_TEXT = 500;

export function normalizeInstance(raw: string): string | null {
  const text = String(raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(text) && text.length <= 100 ? text : null;
}

async function call(instance: string, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  await assertSafeUrl(`https://${instance}${path}`);
  return fetch(`https://${instance}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) }, redirect: 'error', signal: AbortSignal.timeout(30000) });
}

export async function linkMastodon(instanceRaw: string, tokenRaw: string): Promise<LinkResult> {
  const instance = normalizeInstance(instanceRaw);
  const token = String(tokenRaw ?? '').trim();
  if (!instance) return { ok: false, error: 'Enter your server, like mastodon.social.' };
  if (token.length < 20 || token.length > 200 || /\s/.test(token)) return { ok: false, error: 'Paste the access token from Preferences, Development.' };
  try {
    const res = await call(instance, token, '/api/v1/accounts/verify_credentials');
    if (!res.ok) return { ok: false, error: 'That server did not accept the token. Check the server name and that the token can write posts.' };
    const me = (await res.json()) as { acct?: string };
    if (!me.acct) return { ok: false, error: 'That server did not say whose token this is.' };
    return { ok: true, kind: 'mastodon', label: `@${me.acct}@${instance}`, secret: encryptSecret(token), meta: { instance, acct: me.acct } };
  } catch {
    return { ok: false, error: 'Could not reach that server. Check the name and try again.' };
  }
}

async function status(instance: string, token: string, body: Record<string, unknown>): Promise<{ id?: string; url?: string; error?: string }> {
  const res = await call(instance, token, '/api/v1/statuses', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
  if (!res.ok) return { error: `Mastodon said: ${res.status}` };
  const made = (await res.json()) as { id?: string; url?: string };
  return { id: made.id, url: made.url };
}

async function upload(instance: string, token: string, bytes: Buffer, name: string): Promise<string | null> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), name);
  const res = await call(instance, token, '/api/v2/media', { method: 'POST', body: form });
  if (!res.ok) return null;
  const media = (await res.json()) as { id?: string };
  // A 202 means the picture is still being processed; the post waits for it below.
  if (res.status === 202 && media.id) {
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const check = await call(instance, token, `/api/v1/media/${media.id}`).catch(() => null);
      if (check && check.status === 200) break;
    }
  }
  return media.id ?? null;
}

function fit(text: string): string {
  const plain = stripMarkup(text);
  return plain.length <= MAX_TEXT ? plain : `${plain.slice(0, MAX_TEXT - 1).trimEnd()}…`;
}

function credentials(channel: CarouselChannelRow, secret: string): { instance: string; token: string } | null {
  const instance = String(channel.meta.instance ?? '');
  return instance && secret ? { instance, token: secret } : null;
}

/** A carousel or picture: up to four pictures a post, the caption on the first, more slides as replies. */
export async function postCarouselToMastodon(channel: CarouselChannelRow, secret: string, images: Buffer[], caption: string): Promise<PublishResult> {
  const creds = credentials(channel, secret);
  if (!creds) return { ok: false, note: 'The saved login could not be read. Link this channel again.' };
  try {
    let parent: string | undefined;
    let first: string | undefined;
    for (let start = 0; start < images.length; start += 4) {
      const ids: string[] = [];
      for (const [i, png] of images.slice(start, start + 4).entries()) {
        const id = await upload(creds.instance, creds.token, png, `slide-${start + i + 1}.png`);
        if (!id) return { ok: false, note: 'Mastodon refused a picture.' };
        ids.push(id);
      }
      const text = start === 0 ? fit(caption) : `Slides ${start + 1} to ${Math.min(images.length, start + 4)}`;
      const made = await status(creds.instance, creds.token, { status: text, media_ids: ids, visibility: 'public', ...(parent ? { in_reply_to_id: parent } : {}) });
      if (!made.id) return { ok: false, note: made.error ?? 'Mastodon refused the post.' };
      parent = made.id;
      first = first ?? made.url;
    }
    return { ok: true, ...(first ? { url: first } : {}) };
  } catch {
    return { ok: false, note: 'Could not reach that Mastodon server.' };
  }
}

/** An update, poll, quiz or thread. Polls are real polls; a quiz is a poll with the answer in the first reply. */
export async function postToMastodon(channel: CarouselChannelRow, secret: string, post: Post): Promise<PublishResult> {
  const creds = credentials(channel, secret);
  if (!creds) return { ok: false, note: 'The saved login could not be read. Link this channel again.' };
  try {
    if (post.type === 'poll' || post.type === 'quiz') {
      const made = await status(creds.instance, creds.token, { status: fit(post.question), visibility: 'public', poll: { options: post.options.map((o: string) => o.slice(0, 50)), expires_in: 86400, multiple: false } });
      if (!made.id) return { ok: false, note: made.error ?? 'Mastodon refused the poll.' };
      if (post.type === 'quiz') await status(creds.instance, creds.token, { status: fit(`Answer: ${post.options[post.correct]}${post.explanation ? `. ${post.explanation}` : ''}`), in_reply_to_id: made.id, visibility: 'public' });
      return { ok: true, ...(made.url ? { url: made.url } : {}) };
    }
    const parts = post.type === 'thread' ? post.parts.map((part: string, i: number) => `${part}\n\n${i + 1}/${post.parts.length}`) : [post.text];
    let parent: string | undefined;
    let first: string | undefined;
    for (const part of parts) {
      const made = await status(creds.instance, creds.token, { status: fit(part), visibility: 'public', ...(parent ? { in_reply_to_id: parent } : {}) });
      if (!made.id) return { ok: false, note: made.error ?? 'Mastodon refused the post.' };
      parent = made.id;
      first = first ?? made.url;
    }
    return { ok: true, ...(first ? { url: first } : {}) };
  } catch {
    return { ok: false, note: 'Could not reach that Mastodon server.' };
  }
}
