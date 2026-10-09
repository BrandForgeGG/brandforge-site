import { decryptSecret, encryptSecret } from '@/lib/secret-box.js';
import { updateCarouselChannelSecret, type CarouselChannelRow } from '@/lib/project-db';
import type { PublishResult } from '@/lib/carousel-publish';
import { tumblrBlocks, type Post } from '@/lib/post-types.js';

// Tumblr uses OAuth: the person approves BrandForge on Tumblr's own page and we keep a token, never their
// password. It needs a Tumblr app registered once (free, no review): TUMBLR_CLIENT_ID and
// TUMBLR_CLIENT_SECRET. Without them the connect button is hidden and nothing here runs.
const API = 'https://api.tumblr.com/v2';

export function tumblrConfigured(env = process.env): boolean {
  return Boolean(String(env.TUMBLR_CLIENT_ID ?? '').trim() && String(env.TUMBLR_CLIENT_SECRET ?? '').trim());
}

export function tumblrRedirectUri(origin = 'https://brandforge.gg'): string {
  return `${origin}/api/integrations/tumblr/callback`;
}

export function tumblrAuthorizeUrl(state: string, origin?: string): string {
  const params = new URLSearchParams({
    client_id: String(process.env.TUMBLR_CLIENT_ID ?? ''),
    response_type: 'code',
    scope: 'basic write offline_access',
    state,
    redirect_uri: tumblrRedirectUri(origin),
  });
  return `https://www.tumblr.com/oauth2/authorize?${params.toString()}`;
}

type Tokens = { access: string; refresh: string; expires: number };

async function tokenRequest(form: Record<string, string>): Promise<Tokens | null> {
  try {
    const res = await fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...form, client_id: String(process.env.TUMBLR_CLIENT_ID ?? ''), client_secret: String(process.env.TUMBLR_CLIENT_SECRET ?? '') }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    return { access: data.access_token, refresh: data.refresh_token ?? '', expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  } catch {
    return null;
  }
}

/** Turns the code Tumblr sent back into a connected blog: the stored secret and the blog's name. */
export async function connectTumblr(code: string, origin?: string): Promise<{ ok: true; label: string; secret: string; blog: string } | { ok: false; error: string }> {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: tumblrRedirectUri(origin) });
  if (!tokens) return { ok: false, error: 'Tumblr did not accept that sign-in. Try connecting again.' };
  try {
    const res = await fetch(`${API}/user/info`, { headers: { Authorization: `Bearer ${tokens.access}` }, signal: AbortSignal.timeout(15000) });
    const info = (await res.json()) as { response?: { user?: { blogs?: { name: string; primary?: boolean }[] } } };
    const blogs = info.response?.user?.blogs ?? [];
    const blog = (blogs.find((b) => b.primary) ?? blogs[0])?.name;
    if (!blog) return { ok: false, error: 'That Tumblr account has no blog to post to.' };
    return { ok: true, label: `Tumblr: ${blog}`, secret: encryptSecret(JSON.stringify(tokens)), blog };
  } catch {
    return { ok: false, error: 'Could not reach Tumblr. Try again.' };
  }
}

async function accessToken(channel: CarouselChannelRow): Promise<string | null> {
  const raw = channel.secret ? decryptSecret(channel.secret) : null;
  if (!raw) return null;
  let tokens: Tokens;
  try {
    tokens = JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
  if (tokens.expires > Date.now() + 60_000) return tokens.access;
  if (!tokens.refresh) return null;
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
  if (!fresh) return null;
  const next = { ...fresh, refresh: fresh.refresh || tokens.refresh };
  await updateCarouselChannelSecret(channel.id, encryptSecret(JSON.stringify(next)));
  return next.access;
}

async function createPost(channel: CarouselChannelRow, body: BodyInit, headers: Record<string, string>): Promise<PublishResult> {
  const token = await accessToken(channel);
  if (!token) return { ok: false, note: 'Tumblr needs you to connect again.' };
  const blog = String(channel.meta.blog ?? '');
  try {
    const res = await fetch(`${API}/blog/${encodeURIComponent(blog)}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, ...headers }, body, signal: AbortSignal.timeout(45000) });
    if (res.ok) return { ok: true };
    return { ok: false, note: `Tumblr said: ${res.status}` };
  } catch {
    return { ok: false, note: 'Could not reach Tumblr.' };
  }
}

export async function postToTumblr(channel: CarouselChannelRow, post: Post): Promise<PublishResult> {
  const { content, layout } = tumblrBlocks(post);
  return createPost(channel, JSON.stringify({ content, ...(layout ? { layout } : {}), state: 'published' }), { 'Content-Type': 'application/json' });
}

/** A carousel as one Tumblr photo post: the slides in order, the caption as text. */
export async function postCarouselToTumblr(channel: CarouselChannelRow, images: Buffer[], caption: string): Promise<PublishResult> {
  const photos = images.slice(0, 10);
  const content: unknown[] = photos.map((_, i) => ({ type: 'image', media: [{ type: 'image/png', identifier: `slide${i}` }] }));
  if (caption.trim()) content.push({ type: 'text', text: caption.slice(0, 4000) });
  const form = new FormData();
  form.append('json', JSON.stringify({ content, state: 'published' }));
  photos.forEach((bytes, i) => form.append(`slide${i}`, new Blob([new Uint8Array(bytes)], { type: 'image/png' }), `slide-${i + 1}.png`));
  return createPost(channel, form, {});
}
