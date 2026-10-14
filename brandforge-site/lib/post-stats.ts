import { assertSafeUrl } from '@/lib/research.js';

// Public numbers for a published post, read from each network's own public endpoints (no account, no key, except Tumblr
// which takes the app's public client id). Only networks that publish these numbers openly are asked; LinkedIn, Instagram
// and Facebook keep theirs behind permissions we do not have, so their cards show the picture without numbers.
export type PostStats = { likes?: number; reposts?: number; replies?: number; views?: number; image?: string };

const TTL = 5 * 60 * 1000;
const cache = new Map<string, { at: number; stats: PostStats }>();

async function json<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) }).catch(() => null);
  return res && res.ok ? ((await res.json().catch(() => null)) as T | null) : null;
}

function count(text: string): number | undefined {
  const m = /^([\d.,]+)\s*([KkMm])?$/.exec(text.trim());
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * (m[2] ? (m[2].toLowerCase() === 'k' ? 1000 : 1_000_000) : 1));
}

async function bluesky(url: URL): Promise<PostStats> {
  const m = /^\/profile\/([^/]+)\/post\/([^/]+)$/.exec(url.pathname);
  if (!m) return {};
  const api = 'https://public.api.bsky.app/xrpc';
  const did = m[1].startsWith('did:') ? m[1] : (await json<{ did?: string }>(`${api}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(m[1])}`))?.did;
  if (!did) return {};
  const data = await json<{ posts?: { likeCount?: number; repostCount?: number; replyCount?: number; embed?: { images?: { thumb?: string }[]; media?: { images?: { thumb?: string }[] } } }[] }>(`${api}/app.bsky.feed.getPosts?uris=${encodeURIComponent(`at://${did}/app.bsky.feed.post/${m[2]}`)}`);
  const post = data?.posts?.[0];
  if (!post) return {};
  const thumb = post.embed?.images?.[0]?.thumb ?? post.embed?.media?.images?.[0]?.thumb;
  return { likes: post.likeCount, reposts: post.repostCount, replies: post.replyCount, ...(thumb ? { image: thumb } : {}) };
}

async function mastodon(url: URL): Promise<PostStats> {
  const id = /\/(\d{6,})\/?$/.exec(url.pathname)?.[1];
  if (!id) return {};
  const api = `https://${url.host}/api/v1/statuses/${id}`;
  // The server is whatever the person linked, so it is checked as a public address first.
  await assertSafeUrl(api);
  const data = await json<{ favourites_count?: number; reblogs_count?: number; replies_count?: number; media_attachments?: { preview_url?: string }[] }>(api);
  if (!data) return {};
  const image = data.media_attachments?.[0]?.preview_url;
  return { likes: data.favourites_count, reposts: data.reblogs_count, replies: data.replies_count, ...(image ? { image } : {}) };
}

async function tumblr(url: URL): Promise<PostStats> {
  const blog = url.host.replace(/\.tumblr\.com$/, '');
  const id = /\/post\/(\d+)/.exec(url.pathname)?.[1];
  const key = String(process.env.TUMBLR_CLIENT_ID ?? '').trim();
  if (!blog || !id || !key) return {};
  const data = await json<{ response?: { posts?: { note_count?: number; photos?: { original_size?: { url?: string }; alt_sizes?: { url?: string; width?: number }[] }[] }[] } }>(`https://api.tumblr.com/v2/blog/${encodeURIComponent(`${blog}.tumblr.com`)}/posts?id=${id}&api_key=${encodeURIComponent(key)}`);
  const post = data?.response?.posts?.[0];
  if (!post) return {};
  const photo = post.photos?.[0];
  const image = photo?.alt_sizes?.find((size) => (size.width ?? 0) <= 640)?.url ?? photo?.original_size?.url;
  return { likes: post.note_count, ...(image && image.startsWith('https://') ? { image } : {}) };
}

async function telegram(url: URL): Promise<PostStats> {
  // A public channel post's embed page carries its view count.
  const res = await fetch(`https://t.me${url.pathname}?embed=1`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
  if (!res || !res.ok) return {};
  const html = await res.text();
  const views = /tgme_widget_message_views">([^<]+)</.exec(html)?.[1];
  const image = /tgme_widget_message_photo_wrap[^"]*"[^>]*background-image:url\('([^']+)'\)/.exec(html)?.[1];
  return { ...(views ? { views: count(views) } : {}), ...(image && /^https:\/\//.test(image) ? { image } : {}) };
}

async function youtube(url: URL): Promise<PostStats> {
  const data = await json<{ thumbnail_url?: string }>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`);
  return data?.thumbnail_url ? { image: data.thumbnail_url } : {};
}

/** The public numbers (and a picture, when the network has one) for a post. Never throws; cached for five minutes. */
export async function statsFor(network: string, link: string): Promise<PostStats> {
  const hit = cache.get(link);
  if (hit && Date.now() - hit.at < TTL) return hit.stats;
  let stats: PostStats = {};
  try {
    const url = new URL(link);
    if (network === 'bluesky') stats = await bluesky(url);
    else if (network === 'mastodon') stats = await mastodon(url);
    else if (network === 'tumblr') stats = await tumblr(url);
    else if (network === 'telegram') stats = await telegram(url);
    else if (network === 'youtube') stats = await youtube(url);
  } catch {
    stats = {};
  }
  cache.set(link, { at: Date.now(), stats });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return stats;
}
