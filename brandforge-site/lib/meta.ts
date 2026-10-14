import { createCanvas, loadImage } from '@napi-rs/canvas';
import { decryptSecret, encryptSecret } from '@/lib/secret-box.js';
import { removeScheduledImages, uploadScheduledImage, type CarouselChannelRow } from '@/lib/project-db';
import type { PublishResult } from '@/lib/carousel-publish';
import { stripMarkup, type Post } from '@/lib/post-types.js';

// Facebook Pages and Instagram, through one Meta app. One approval on Meta's own page links every Page the person runs and the
// Instagram business account attached to each. While the app is in development mode it posts for the app's own admins and
// testers with no review; for everyone else Meta's app review is needed first (see the setup notes). The Page token we keep
// does not expire; it is encrypted and never shown.
export type MetaKind = 'facebook' | 'instagram';

const GRAPH = 'https://graph.facebook.com/v23.0';
const SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management';
const env = (name: string) => String(process.env[name] ?? '').trim();

export function isMetaKind(value: string): value is MetaKind {
  return value === 'facebook' || value === 'instagram';
}

export function metaConfigured(): boolean {
  return Boolean(env('META_APP_ID') && env('META_APP_SECRET'));
}

export function metaRedirectUri(origin: string): string {
  return `${origin}/api/integrations/meta/callback`;
}

export function metaAuthorizeUrl(state: string, origin: string): string {
  const params = new URLSearchParams({ client_id: env('META_APP_ID'), redirect_uri: metaRedirectUri(origin), state, scope: SCOPES, response_type: 'code' });
  return `https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`;
}

export type MetaChannel = { kind: MetaKind; label: string; secret: string; meta: Record<string, unknown> };

async function graph<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, { ...init, signal: AbortSignal.timeout(30000) });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

/** Turns the code Meta sent back into channels: one per Page, plus one per Instagram account attached to a Page. */
export async function connectMeta(code: string, origin: string): Promise<{ ok: true; channels: MetaChannel[] } | { ok: false }> {
  try {
    const short = await graph<{ access_token?: string }>(`/oauth/access_token?${new URLSearchParams({ client_id: env('META_APP_ID'), client_secret: env('META_APP_SECRET'), redirect_uri: metaRedirectUri(origin), code })}`);
    if (!short.ok || !short.data.access_token) return { ok: false };
    const long = await graph<{ access_token?: string }>(`/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: env('META_APP_ID'), client_secret: env('META_APP_SECRET'), fb_exchange_token: short.data.access_token })}`);
    const userToken = long.data.access_token ?? short.data.access_token;
    const pages = await graph<{ data?: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] }>(`/me/accounts?${new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '10', access_token: userToken })}`);
    if (!pages.ok || !pages.data.data?.length) return { ok: false };
    const channels: MetaChannel[] = [];
    for (const page of pages.data.data.slice(0, 5)) {
      channels.push({ kind: 'facebook', label: `Facebook: ${page.name.slice(0, 40)}`, secret: encryptSecret(page.access_token), meta: { pageId: page.id } });
      if (page.instagram_business_account?.id) {
        channels.push({ kind: 'instagram', label: `Instagram: @${page.instagram_business_account.username ?? page.instagram_business_account.id}`, secret: encryptSecret(page.access_token), meta: { igId: page.instagram_business_account.id, pageId: page.id } });
      }
    }
    return { ok: true, channels };
  } catch {
    return { ok: false };
  }
}

function failure(label: string, data: unknown, status: number): PublishResult {
  const error = (data as { error?: { message?: string; code?: number } } | undefined)?.error;
  if (error?.code === 190) return { ok: false, note: `${label} needs you to connect again.` };
  return { ok: false, note: `${label} said: ${String(error?.message ?? status).slice(0, 160)}` };
}

const blob = (png: Buffer) => new Blob([new Uint8Array(png)], { type: 'image/png' });

// ---------------- Facebook ----------------

/** Pictures to a Page: one photo post, or several photos in one post. */
async function facebookPhotos(channel: CarouselChannelRow, token: string, images: Buffer[], caption: string): Promise<PublishResult> {
  const page = String(channel.meta.pageId ?? '');
  if (!page) return { ok: false, note: 'Facebook needs you to connect again.' };
  const message = stripMarkup(caption).slice(0, 5000);
  if (images.length === 1) {
    const form = new FormData();
    form.append('source', blob(images[0]), 'post.png');
    form.append('message', message);
    form.append('access_token', token);
    const res = await graph<{ id?: string; post_id?: string }>(`/${page}/photos`, { method: 'POST', body: form });
    return res.ok ? { ok: true, ...(res.data.post_id || res.data.id ? { ref: String(res.data.post_id ?? res.data.id) } : {}) } : failure('Facebook', res.data, res.status);
  }
  const ids: string[] = [];
  for (const png of images.slice(0, 10)) {
    const form = new FormData();
    form.append('source', blob(png), 'slide.png');
    form.append('published', 'false');
    form.append('access_token', token);
    const up = await graph<{ id?: string }>(`/${page}/photos`, { method: 'POST', body: form });
    if (!up.ok || !up.data.id) return failure('Facebook', up.data, up.status);
    ids.push(up.data.id);
  }
  const body = new URLSearchParams({ message, access_token: token });
  ids.forEach((id, i) => body.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
  const res = await graph<{ id?: string }>(`/${page}/feed`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  return res.ok ? { ok: true, ...(res.data.id ? { ref: String(res.data.id) } : {}) } : failure('Facebook', res.data, res.status);
}

// ---------------- Instagram ----------------

// Instagram takes JPEG pictures from a public address, not uploads. Each slide is made a JPEG, kept for a few minutes in the
// public pictures bucket, and deleted as soon as Instagram has fetched it.
async function toJpeg(png: Buffer): Promise<Buffer> {
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toBuffer('image/jpeg', 90);
}

async function publicUrlFor(path: string): Promise<string | null> {
  const base = env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  return base ? `${base}/storage/v1/object/public/creations/${path}` : null;
}

async function waitFinished(id: string, token: string): Promise<boolean> {
  for (let i = 0; i < 12; i++) {
    const status = await graph<{ status_code?: string }>(`/${id}?${new URLSearchParams({ fields: 'status_code', access_token: token })}`);
    if (status.data.status_code === 'FINISHED') return true;
    if (status.data.status_code === 'ERROR' || status.data.status_code === 'EXPIRED') return false;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return false;
}

async function instagramPhotos(channel: CarouselChannelRow, token: string, images: Buffer[], caption: string): Promise<PublishResult> {
  const ig = String(channel.meta.igId ?? '');
  if (!ig) return { ok: false, note: 'Instagram needs you to connect again.' };
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const paths: string[] = [];
  try {
    const urls: string[] = [];
    for (const [i, png] of images.slice(0, 10).entries()) {
      const path = `instagram-tmp/${stamp}/slide-${i + 1}.jpg`;
      const jpeg = await toJpeg(png);
      const stored = await uploadScheduledImage(path, jpeg, 'image/jpeg');
      if (!stored) return { ok: false, note: 'Could not prepare the pictures for Instagram.' };
      paths.push(path);
      const url = await publicUrlFor(path);
      if (!url) return { ok: false, note: 'Could not prepare the pictures for Instagram.' };
      urls.push(url);
    }
    const text = stripMarkup(caption).slice(0, 2200);
    let creation: string | undefined;
    if (urls.length === 1) {
      const made = await graph<{ id?: string }>(`/${ig}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ image_url: urls[0], caption: text, access_token: token }).toString() });
      if (!made.ok || !made.data.id) return failure('Instagram', made.data, made.status);
      creation = made.data.id;
    } else {
      const children: string[] = [];
      for (const url of urls) {
        const child = await graph<{ id?: string }>(`/${ig}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ image_url: url, is_carousel_item: 'true', access_token: token }).toString() });
        if (!child.ok || !child.data.id) return failure('Instagram', child.data, child.status);
        children.push(child.data.id);
      }
      for (const id of children) if (!(await waitFinished(id, token))) return { ok: false, note: 'Instagram could not read one of the pictures.' };
      const parent = await graph<{ id?: string }>(`/${ig}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), caption: text, access_token: token }).toString() });
      if (!parent.ok || !parent.data.id) return failure('Instagram', parent.data, parent.status);
      creation = parent.data.id;
    }
    if (!(await waitFinished(creation, token))) return { ok: false, note: 'Instagram could not process the post. Pictures must be between 4:5 and 1.91:1.' };
    const published = await graph<{ id?: string }>(`/${ig}/media_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: creation, access_token: token }).toString() });
    if (!published.ok) return failure('Instagram', published.data, published.status);
    const link = published.data.id ? await graph<{ permalink?: string }>(`/${published.data.id}?${new URLSearchParams({ fields: 'permalink', access_token: token })}`).catch(() => null) : null;
    return { ok: true, ...(link?.data.permalink ? { url: link.data.permalink } : {}) };
  } catch {
    return { ok: false, note: 'Could not reach Instagram.' };
  } finally {
    await removeScheduledImages(paths);
  }
}

// ---------------- Public ----------------

export async function postCarouselToMeta(kind: MetaKind, channel: CarouselChannelRow, images: Buffer[], caption: string): Promise<PublishResult> {
  const token = channel.secret ? decryptSecret(channel.secret) : null;
  if (!token) return { ok: false, note: `${kind === 'facebook' ? 'Facebook' : 'Instagram'} needs you to connect again.` };
  try {
    return kind === 'facebook' ? await facebookPhotos(channel, token, images, caption) : await instagramPhotos(channel, token, images, caption);
  } catch {
    return { ok: false, note: `Could not reach ${kind === 'facebook' ? 'Facebook' : 'Instagram'}.` };
  }
}

/** Text posts. Facebook takes an update, a thread joined into one post, or a poll as a numbered question. Instagram needs a picture. */
export async function postToMeta(kind: MetaKind, channel: CarouselChannelRow, post: Post): Promise<PublishResult> {
  if (kind === 'instagram') return { ok: false, note: 'Instagram posts need a picture. Post a carousel or image there instead.' };
  const token = channel.secret ? decryptSecret(channel.secret) : null;
  const page = String(channel.meta.pageId ?? '');
  if (!token || !page) return { ok: false, note: 'Facebook needs you to connect again.' };
  const message =
    post.type === 'update'
      ? stripMarkup(post.text)
      : post.type === 'thread'
        ? post.parts.map((part: string) => stripMarkup(part)).join('\n\n')
        : `${post.question}\n\n${post.options.map((o: string, i: number) => `${i + 1}. ${o}`).join('\n')}\n\nComment your number.`;
  try {
    const res = await graph<{ id?: string }>(`/${page}/feed`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ message: message.slice(0, 5000), access_token: token }).toString() });
    return res.ok ? { ok: true, ...(res.data.id ? { ref: String(res.data.id) } : {}) } : failure('Facebook', res.data, res.status);
  } catch {
    return { ok: false, note: 'Could not reach Facebook.' };
  }
}

