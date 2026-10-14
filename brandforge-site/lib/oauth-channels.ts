import { createHash, createHmac } from 'node:crypto';
import { decryptSecret, encryptSecret } from '@/lib/secret-box.js';
import { updateCarouselChannelSecret, type CarouselChannelRow } from '@/lib/project-db';
import type { PublishResult } from '@/lib/carousel-publish';
import { stripMarkup, type Post } from '@/lib/post-types.js';

// LinkedIn and X: the person approves BrandForge on the platform's own page; we keep an encrypted token, never a password.
// Both need a developer app made once (free). Without its keys a platform's connect button says "Coming soon" and nothing
// here runs. Redirect addresses to register: {origin}/api/integrations/oauth/linkedin/callback and .../x/callback.
export type OAuthKind = 'linkedin' | 'x';
export const OAUTH_KINDS: OAuthKind[] = ['linkedin', 'x'];

const CFG = {
  linkedin: { idEnv: 'LINKEDIN_CLIENT_ID', secretEnv: 'LINKEDIN_CLIENT_SECRET', authorize: 'https://www.linkedin.com/oauth/v2/authorization', token: 'https://www.linkedin.com/oauth/v2/accessToken', scope: 'openid profile w_member_social', label: 'LinkedIn' },
  x: { idEnv: 'X_CLIENT_ID', secretEnv: 'X_CLIENT_SECRET', authorize: 'https://x.com/i/oauth2/authorize', token: 'https://api.x.com/2/oauth2/token', scope: 'tweet.read tweet.write users.read media.write offline.access', label: 'X' },
} as const;

const env = (name: string) => String(process.env[name] ?? '').trim();

export function isOAuthKind(value: string): value is OAuthKind {
  return value === 'linkedin' || value === 'x';
}

export function oauthConfigured(kind: OAuthKind): boolean {
  return Boolean(env(CFG[kind].idEnv) && env(CFG[kind].secretEnv));
}

export function oauthRedirectUri(kind: OAuthKind, origin: string): string {
  return `${origin}/api/integrations/oauth/${kind}/callback`;
}

// X needs a PKCE verifier. It is derived from the signed state, so nothing has to be stored between the two steps.
function verifierFor(state: string): string {
  return createHmac('sha256', env('X_CLIENT_SECRET') || 'x').update(`pkce:${state}`).digest('base64url');
}

export function oauthAuthorizeUrl(kind: OAuthKind, state: string, origin: string): string {
  const cfg = CFG[kind];
  const params = new URLSearchParams({ response_type: 'code', client_id: env(cfg.idEnv), redirect_uri: oauthRedirectUri(kind, origin), scope: cfg.scope, state });
  if (kind === 'x') {
    params.set('code_challenge', createHash('sha256').update(verifierFor(state)).digest('base64url'));
    params.set('code_challenge_method', 'S256');
  }
  return `${cfg.authorize}?${params.toString()}`;
}

type Tokens = { access: string; refresh: string; expires: number };

async function tokenRequest(kind: OAuthKind, form: Record<string, string>): Promise<Tokens | null> {
  const cfg = CFG[kind];
  // X apps are either confidential (client id and secret sent as a Basic header) or public (client id in the body, no secret).
  // A mismatch is answered with a 401, so X is tried both ways instead of guessing which kind the app was made as.
  const attempts: { basic: boolean }[] = kind === 'x' ? [{ basic: true }, { basic: false }] : [{ basic: false }];
  for (const attempt of attempts) {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams(form);
    if (kind === 'x' && attempt.basic) headers.Authorization = `Basic ${Buffer.from(`${env(cfg.idEnv)}:${env(cfg.secretEnv)}`).toString('base64')}`;
    else {
      body.set('client_id', env(cfg.idEnv));
      if (kind !== 'x') body.set('client_secret', env(cfg.secretEnv));
    }
    try {
      const res = await fetch(cfg.token, { method: 'POST', headers, body: body.toString(), signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        console.error(`[oauth] ${kind} token request failed (${attempt.basic ? 'basic' : 'body'}):`, res.status, (await res.text().catch(() => '')).slice(0, 300));
        continue;
      }
      const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
      if (!data.access_token) continue;
      return { access: data.access_token, refresh: data.refresh_token ?? '', expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
    } catch {
      continue;
    }
  }
  return null;
}

/** Turns the code the platform sent back into a connected account: the stored secret, a label and what posting needs. */
export async function connectOAuth(kind: OAuthKind, code: string, state: string, origin: string): Promise<{ ok: true; label: string; secret: string; meta: Record<string, unknown> } | { ok: false }> {
  const form: Record<string, string> = { grant_type: 'authorization_code', code, redirect_uri: oauthRedirectUri(kind, origin) };
  if (kind === 'x') form.code_verifier = verifierFor(state);
  const tokens = await tokenRequest(kind, form);
  if (!tokens) return { ok: false };
  try {
    if (kind === 'linkedin') {
      const res = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access}` }, signal: AbortSignal.timeout(15000) });
      const me = (await res.json()) as { sub?: string; name?: string };
      if (!res.ok || !me.sub) {
        console.error('[oauth] linkedin profile request failed:', res.status, JSON.stringify(me).slice(0, 300));
        return { ok: false };
      }
      return { ok: true, label: `LinkedIn: ${String(me.name ?? 'your profile').slice(0, 40)}`, secret: encryptSecret(JSON.stringify(tokens)), meta: { author: `urn:li:person:${me.sub}` } };
    }
    const res = await fetch('https://api.x.com/2/users/me', { headers: { Authorization: `Bearer ${tokens.access}` }, signal: AbortSignal.timeout(15000) });
    const me = (await res.json()) as { data?: { username?: string } };
    if (!res.ok || !me.data?.username) {
      console.error('[oauth] x profile request failed:', res.status, JSON.stringify(me).slice(0, 300));
      return { ok: false };
    }
    return { ok: true, label: `X: @${me.data.username}`, secret: encryptSecret(JSON.stringify(tokens)), meta: { username: me.data.username } };
  } catch (cause) {
    console.error(`[oauth] ${kind} connect threw:`, cause instanceof Error ? cause.message : cause);
    return { ok: false };
  }
}

async function accessToken(kind: OAuthKind, channel: CarouselChannelRow): Promise<string | null> {
  const raw = channel.secret ? decryptSecret(channel.secret) : null;
  if (!raw) return null;
  let tokens: Tokens;
  try {
    tokens = JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
  if (tokens.expires > Date.now() + 60_000) return tokens.access;
  // LinkedIn gives refresh tokens only to approved partners, so its sign-in simply lapses after about 60 days.
  if (!tokens.refresh) return null;
  const fresh = await tokenRequest(kind, { grant_type: 'refresh_token', refresh_token: tokens.refresh });
  if (!fresh) return null;
  const next = { ...fresh, refresh: fresh.refresh || tokens.refresh };
  await updateCarouselChannelSecret(channel.id, encryptSecret(JSON.stringify(next)));
  return next.access;
}

const AGAIN = (label: string): PublishResult => ({ ok: false, note: `${label} needs you to connect again.` });

// ---------------- LinkedIn ----------------

const LI = 'https://api.linkedin.com/rest';
// LinkedIn retires each API version about a year after release; a retired version makes every call fail. 202609 is
// supported until at least September 2027: move it forward once a year (versions: learn.microsoft.com/linkedin/marketing/versioning).
const LI_HEADERS = { 'LinkedIn-Version': '202609', 'X-Restli-Protocol-Version': '2.0.0' };

async function linkedinUpload(token: string, owner: string, png: Buffer): Promise<string | null> {
  const init = await fetch(`${LI}/images?action=initializeUpload`, { method: 'POST', headers: { ...LI_HEADERS, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ initializeUploadRequest: { owner } }), signal: AbortSignal.timeout(20000) });
  if (!init.ok) {
    console.error('[oauth] linkedin image init failed:', init.status, (await init.text().catch(() => '')).slice(0, 300));
    return null;
  }
  const { value } = (await init.json()) as { value?: { uploadUrl?: string; image?: string } };
  if (!value?.uploadUrl || !value.image) {
    console.error('[oauth] linkedin image init returned no upload address');
    return null;
  }
  const put = await fetch(value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(png), signal: AbortSignal.timeout(45000) });
  if (!put.ok) console.error('[oauth] linkedin image upload failed:', put.status, (await put.text().catch(() => '')).slice(0, 300));
  return put.ok ? value.image : null;
}

async function linkedinPost(token: string, author: string, commentary: string, images: string[] = []): Promise<PublishResult> {
  const content = images.length === 0 ? undefined : images.length === 1 ? { media: { id: images[0], altText: 'Post picture' } } : { multiImage: { images: images.map((id, i) => ({ id, altText: `Slide ${i + 1}` })) } };
  const res = await fetch(`${LI}/posts`, {
    method: 'POST',
    headers: { ...LI_HEADERS, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ author, commentary: commentary.slice(0, 3000), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false, ...(content ? { content } : {}) }),
    signal: AbortSignal.timeout(30000),
  });
  if (res.ok) {
    const urn = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id') ?? '';
    return { ok: true, ...(urn ? { ref: urn } : {}) };
  }
  console.error('[oauth] linkedin post failed:', res.status, (await res.text().catch(() => '')).slice(0, 300));
  return { ok: false, note: res.status === 401 ? 'LinkedIn needs you to connect again.' : `LinkedIn said: ${res.status}` };
}

function linkedinText(post: Post): string {
  if (post.type === 'update') return stripMarkup(post.text);
  if (post.type === 'thread') return post.parts.map((part: string) => stripMarkup(part)).join('\n\n');
  const options = post.options.map((o: string, i: number) => `${i + 1}. ${o}`).join('\n');
  return `${post.question}\n\n${options}\n\nTell us your number in the comments.`;
}

// ---------------- X ----------------

const X = 'https://api.x.com/2';

async function xUpload(token: string, png: Buffer): Promise<string | null> {
  const form = new FormData();
  form.append('media', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'slide.png');
  form.append('media_category', 'tweet_image');
  const res = await fetch(`${X}/media/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    console.error('[oauth] x media upload failed:', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return null;
  }
  const data = (await res.json()) as { data?: { id?: string }; media_id_string?: string };
  return data.data?.id ?? data.media_id_string ?? null;
}

async function xTweet(token: string, body: Record<string, unknown>): Promise<{ id?: string; error?: string }> {
  const res = await fetch(`${X}/tweets`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (res.ok) return { id: ((await res.json()) as { data?: { id?: string } }).data?.id };
  if (res.status !== 401 && res.status !== 429) console.error('[oauth] x tweet failed:', res.status, (await res.text().catch(() => '')).slice(0, 300));
  return { error: res.status === 401 ? 'X needs you to connect again.' : res.status === 429 ? 'X says the posting limit is used up for now.' : res.status === 402 ? 'X needs API credits on the developer account before it can post.' : `X said: ${res.status}` };
}

function xFit(text: string): string {
  const plain = stripMarkup(text);
  return [...plain].length <= 280 ? plain : `${[...plain].slice(0, 279).join('').trimEnd()}…`;
}

// ---------------- Public ----------------

/** A carousel or picture: up to four pictures a tweet (more slides become replies), or one LinkedIn post with all of them. */
export async function postCarouselToOAuth(kind: OAuthKind, channel: CarouselChannelRow, images: Buffer[], caption: string): Promise<PublishResult> {
  const token = await accessToken(kind, channel);
  if (!token) return AGAIN(CFG[kind].label);
  try {
    if (kind === 'linkedin') {
      const author = String(channel.meta.author ?? '');
      if (!author) return AGAIN('LinkedIn');
      const ids: string[] = [];
      for (const png of images.slice(0, 9)) {
        const id = await linkedinUpload(token, author, png);
        if (!id) return { ok: false, note: 'LinkedIn refused a picture.' };
        ids.push(id);
      }
      return linkedinPost(token, author, stripMarkup(caption), ids);
    }
    let parent: string | undefined;
    for (let start = 0; start < images.length; start += 4) {
      const ids: string[] = [];
      for (const png of images.slice(start, start + 4)) {
        const id = await xUpload(token, png);
        if (!id) return { ok: false, note: 'X refused a picture. If the log says 402, the developer account needs API credits; otherwise the app needs the media.write permission.' };
        ids.push(id);
      }
      const text = start === 0 ? xFit(caption) : `Slides ${start + 1} to ${Math.min(images.length, start + 4)}`;
      const made = await xTweet(token, { text, media: { media_ids: ids }, ...(parent ? { reply: { in_reply_to_tweet_id: parent } } : {}) });
      if (!made.id) return { ok: false, note: made.error ?? 'X refused the post.' };
      parent = made.id;
    }
    return { ok: true };
  } catch {
    return { ok: false, note: `Could not reach ${CFG[kind].label}.` };
  }
}

/** An update, poll, quiz or thread. X gets real polls and linked threads; LinkedIn gets one post. */
export async function postToOAuth(kind: OAuthKind, channel: CarouselChannelRow, post: Post): Promise<PublishResult> {
  const token = await accessToken(kind, channel);
  if (!token) return AGAIN(CFG[kind].label);
  try {
    if (kind === 'linkedin') {
      const author = String(channel.meta.author ?? '');
      if (!author) return AGAIN('LinkedIn');
      return linkedinPost(token, author, linkedinText(post));
    }
    if (post.type === 'poll' || post.type === 'quiz') {
      const made = await xTweet(token, { text: xFit(post.question), poll: { options: post.options.slice(0, 4).map((o: string) => o.slice(0, 25)), duration_minutes: 1440 } });
      if (!made.id) return { ok: false, note: made.error ?? 'X refused the poll.' };
      if (post.type === 'quiz') await xTweet(token, { text: xFit(`Answer: ${post.options[post.correct]}${post.explanation ? `. ${post.explanation}` : ''}`), reply: { in_reply_to_tweet_id: made.id } });
      return { ok: true };
    }
    const parts = post.type === 'thread' ? post.parts.map((part: string, i: number) => `${part}\n\n${i + 1}/${post.parts.length}`) : [post.text];
    let parent: string | undefined;
    for (const part of parts) {
      const made = await xTweet(token, { text: xFit(part), ...(parent ? { reply: { in_reply_to_tweet_id: parent } } : {}) });
      if (!made.id) return { ok: false, note: made.error ?? 'X refused the post.' };
      parent = made.id;
    }
    return { ok: true };
  } catch {
    return { ok: false, note: 'Could not reach X.' };
  }
}
