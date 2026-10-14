import { randomUUID } from 'node:crypto';
import { recordPublishedPosts, uploadCommunityImage, type CarouselChannelRow } from '@/lib/project-db';
import type { PublishResult } from '@/lib/carousel-publish';
import { postUrl } from '@/lib/post-links.js';
import { sniff } from '@/lib/carousel-fetch.js';

/**
 * After a send: keeps the public link of every post that went out, for the "Just published" list on Distribute. The post's
 * first picture is kept once (public bucket) as its preview, so every network shows a real picture, including the ones that
 * hide their own previews behind a login.
 */
export async function recordLinks(userId: string, channels: CarouselChannelRow[], results: Record<string, PublishResult>, caption: string, firstImage?: Buffer | null): Promise<void> {
  const items = channels
    .map((channel) => ({ network: channel.kind, url: postUrl(channel.kind, channel, results[channel.id] ?? null), caption }))
    .filter((item): item is { network: CarouselChannelRow['kind']; url: string; caption: string } => Boolean(item.url));
  if (items.length === 0) return;
  let thumb = '';
  const type = firstImage ? sniff(firstImage) : null;
  if (firstImage && (type === 'image/png' || type === 'image/jpeg') && firstImage.length <= 2 * 1024 * 1024) {
    thumb = (await uploadCommunityImage(`published/${userId}/${randomUUID()}.${type === 'image/jpeg' ? 'jpg' : 'png'}`, firstImage, type).catch(() => null)) ?? '';
  }
  await recordPublishedPosts(userId, items.map((item) => ({ ...item, thumb }))).catch(() => undefined);
}
