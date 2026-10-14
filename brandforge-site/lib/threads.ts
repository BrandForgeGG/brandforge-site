import { decryptSecret, encryptSecret } from '@/lib/secret-box.js';
import { removeScheduledImages, updateCarouselChannelSecret, uploadScheduledImage, type CarouselChannelRow } from '@/lib/project-db';
import type { PublishResult } from '@/lib/carousel-publish';
import { stripMarkup, type Post } from '@/lib/post-types.js';

// Threads, through a Meta app made with the "Access the Threads API" use case (its own Threads app ID and secret, separate from
// the Facebook app). The person approves BrandForge on Threads' own page; we keep a 60-day token, refreshed while in use,
// encrypted and never shown. In development mode it posts for the app's admins and Threads testers with no review.
const AUTH = 'https://threads.net/oauth/authorize';
const API = 'https://graph.threads.net';
const SCOPES = 'threads_basic,threads_content_publish';
const MAX_TEXT = 500;
const env = (name: string) => String(process.env[name] ?? '').trim();

export function threadsConfigured(): boolean {
  return Boolean(env('THREADS_APP_ID') && env('THREADS_APP_SECRET'));
}

export function threadsRedirectUri(origin: string): string {
  return `${origin}/api/integrations/threads/callback`;
}

export function threadsAuthorizeUrl(state: string, origin: string): string {
  const params = new URLSearchParams({ client_id: env('THREADS_APP_ID'), redirect_uri: threadsRedirectUri(origin), scope: SCOPES, response_type: 'code', state });
  return `${AUTH}?${params.toString()}`;
}

type Tokens = { access: string; expires: number; userId: string };

async function json<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

/** Turns the code Threads sent back into a connected account: the stored secret, a label and the account id. */
export async function connectThreads(code: string, origin: string): Promise<{ ok: true; label: string; secret: string; meta: Record<string, unknown> } | { ok: false }> {
  try {
    const short = await json<{ access_token?: string; user_id?: string | number; error_message?: string }>(`${API}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env('THREADS_APP_ID'), client_secret: env('THREADS_APP_SECRET'), grant_type: 'authorization_code', redirect_uri: threadsRedirectUri(origin), code }).toString(),
    });
    if (!short.ok || !short.data.access_token) {
      console.error('[threads] token request failed:', short.status, JSON.stringify(short.data).slice(0, 300));
      return { ok: false };
    }
    const long = await json<{ access_token?: string; expires_in?: number }>(`${API}/access_token?${new URLSearchParams({ grant_type: 'th_exchange_token', client_secret: env('THREADS_APP_SECRET'), access_token: short.data.access_token })}`);
    const access = long.data.access_token ?? short.data.access_token;
    const expires = Date.now() + (long.data.expires_in ?? 3600) * 1000;
    const me = await json<{ id?: string; username?: string }>(`${API}/v1.0/me?${new URLSearchParams({ fields: 'id,username', access_token: access })}`);
    if (!me.ok || !me.data.id) {
      console.error('[threads] profile request failed:', me.status, JSON.stringify(me.data).slice(0, 300));
      return { ok: false };
    }
    const tokens: Tokens = { access, expires, userId: me.data.id };
    return { ok: true, label: `Threads: @${me.data.username ?? me.data.id}`, secret: encryptSecret(JSON.stringify(tokens)), meta: { userId: me.data.id } };
  } catch (cause) {
    console.error('[threads] connect threw:', cause instanceof Error ? cause.message : cause);
    return { ok: false };
  }
}

// A long-lived token lasts 60 days and can be refreshed once it is a day old, so it is refreshed whenever it is used with
// fewer than 50 days left. A token that has run out needs the person to connect again.
async function session(channel: CarouselChannelRow): Promise<Tokens | null> {
  const raw = channel.secret ? decryptSecret(channel.secret) : null;
  if (!raw) return null;
  let tokens: Tokens;
  try {
    tokens = JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
  if (tokens.expires <= Date.now()) return null;
  if (tokens.expires - Date.now() < 50 * 24 * 60 * 60 * 1000) {
    const fresh = await json<{ access_token?: string; expires_in?: number }>(`${API}/refresh_access_token?${new URLSearchParams({ grant_type: 'th_refresh_token', access_token: tokens.access })}`).catch(() => null);
    if (fresh?.ok && fresh.data.access_token) {
      tokens = { ...tokens, access: fresh.data.access_token, expires: Date.now() + (fresh.data.expires_in ?? 5184000) * 1000 };
      await updateCarouselChannelSecret(channel.id, encryptSecret(JSON.stringify(tokens)));
    }
  }
  return tokens;
}

function failure(data: unknown, status: number): PublishResult {
  const error = (data as { error?: { message?: string; code?: number } } | undefined)?.error;
  if (error?.code === 190 || status === 401) return { ok: false, note: 'Threads needs you to connect again.' };
  return { ok: false, note: `Threads said: ${String(error?.message ?? status).slice(0, 160)}` };
}

async function permalink(tokens: Tokens, id: string): Promise<string | undefined> {
  const res = await json<{ permalink?: string }>(`${API}/v1.0/${id}?${new URLSearchParams({ fields: 'permalink', access_token: tokens.access })}`).catch(() => null);
  return res?.data.permalink;
}

function fit(text: string): string {
  const plain = stripMarkup(text);
  return [...plain].length <= MAX_TEXT ? plain : `${[...plain].slice(0, MAX_TEXT - 1).join('').trimEnd()}…`;
}

async function container(tokens: Tokens, fields: Record<string, string>): Promise<{ id?: string; fail?: PublishResult }> {
  const res = await json<{ id?: string }>(`${API}/v1.0/${tokens.userId}/threads`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, access_token: tokens.access }).toString() });
  return res.ok && res.data.id ? { id: res.data.id } : { fail: failure(res.data, res.status) };
}

async function finished(id: string, tokens: Tokens): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    const res = await json<{ status?: string }>(`${API}/v1.0/${id}?${new URLSearchParams({ fields: 'status', access_token: tokens.access })}`);
    if (res.data.status === 'FINISHED') return true;
    if (res.data.status === 'ERROR' || res.data.status === 'EXPIRED') return false;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

async function publish(tokens: Tokens, creation: string): Promise<{ id?: string; fail?: PublishResult }> {
  if (!(await finished(creation, tokens))) return { fail: { ok: false, note: 'Threads could not process the post.' } };
  const res = await json<{ id?: string }>(`${API}/v1.0/${tokens.userId}/threads_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: creation, access_token: tokens.access }).toString() });
  return res.ok && res.data.id ? { id: res.data.id } : { fail: failure(res.data, res.status) };
}

async function textPost(tokens: Tokens, text: string, replyTo?: string): Promise<{ id?: string; fail?: PublishResult }> {
  const made = await container(tokens, { media_type: 'TEXT', text: fit(text), ...(replyTo ? { reply_to_id: replyTo } : {}) });
  if (!made.id) return { fail: made.fail };
  return publish(tokens, made.id);
}

/** Pictures: one image post, or a carousel of up to 20. Threads fetches pictures from a public address, so each is kept for a
 *  few minutes in the public pictures bucket and deleted once Threads has it. */
export async function postCarouselToThreads(channel: CarouselChannelRow, images: Buffer[], caption: string): Promise<PublishResult> {
  const tokens = await session(channel);
  if (!tokens) return { ok: false, note: 'Threads needs you to connect again.' };
  const base = env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const paths: string[] = [];
  try {
    const urls: string[] = [];
    for (const [i, png] of images.slice(0, 20).entries()) {
      const path = `threads-tmp/${stamp}/slide-${i + 1}.png`;
      if (!base || !(await uploadScheduledImage(path, png))) return { ok: false, note: 'Could not prepare the pictures for Threads.' };
      paths.push(path);
      urls.push(`${base}/storage/v1/object/public/creations/${path}`);
    }
    let creation: string | undefined;
    if (urls.length === 1) {
      const made = await container(tokens, { media_type: 'IMAGE', image_url: urls[0], text: fit(caption) });
      if (!made.id) return made.fail ?? { ok: false, note: 'Threads refused the picture.' };
      creation = made.id;
    } else {
      const children: string[] = [];
      for (const url of urls) {
        const child = await container(tokens, { media_type: 'IMAGE', image_url: url, is_carousel_item: 'true' });
        if (!child.id) return child.fail ?? { ok: false, note: 'Threads refused a picture.' };
        children.push(child.id);
      }
      for (const id of children) if (!(await finished(id, tokens))) return { ok: false, note: 'Threads could not read one of the pictures.' };
      const parent = await container(tokens, { media_type: 'CAROUSEL', children: children.join(','), text: fit(caption) });
      if (!parent.id) return parent.fail ?? { ok: false, note: 'Threads refused the carousel.' };
      creation = parent.id;
    }
    const done = await publish(tokens, creation);
    if (!done.id) return done.fail ?? { ok: false, note: 'Threads refused the post.' };
    const url = await permalink(tokens, done.id);
    return { ok: true, ...(url ? { url } : {}) };
  } catch {
    return { ok: false, note: 'Could not reach Threads.' };
  } finally {
    await removeScheduledImages(paths);
  }
}

/** An update, a thread of replies, or a poll or quiz as a numbered question (the answer to a quiz goes in the first reply). */
export async function postToThreads(channel: CarouselChannelRow, post: Post): Promise<PublishResult> {
  const tokens = await session(channel);
  if (!tokens) return { ok: false, note: 'Threads needs you to connect again.' };
  try {
    if (post.type === 'poll' || post.type === 'quiz') {
      const first = await textPost(tokens, `${post.question}\n\n${post.options.map((o: string, i: number) => `${i + 1}. ${o}`).join('\n')}\n\nReply with your number.`);
      if (!first.id) return first.fail ?? { ok: false, note: 'Threads refused the post.' };
      if (post.type === 'quiz') await textPost(tokens, `Answer: ${post.options[post.correct]}${post.explanation ? `. ${post.explanation}` : ''}`, first.id);
      const url = await permalink(tokens, first.id);
      return { ok: true, ...(url ? { url } : {}) };
    }
    const parts = post.type === 'thread' ? post.parts.map((part: string, i: number) => `${part}\n\n${i + 1}/${post.parts.length}`) : [post.text];
    let parent: string | undefined;
    let first: string | undefined;
    for (const part of parts) {
      const made = await textPost(tokens, part, parent);
      if (!made.id) return made.fail ?? { ok: false, note: 'Threads refused the post.' };
      parent = made.id;
      first = first ?? made.id;
    }
    const url = first ? await permalink(tokens, first) : undefined;
    return { ok: true, ...(url ? { url } : {}) };
  } catch {
    return { ok: false, note: 'Could not reach Threads.' };
  }
}
