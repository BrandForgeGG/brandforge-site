import { recordPublishedPosts, type CarouselChannelRow } from '@/lib/project-db';
import type { PublishResult } from '@/lib/carousel-publish';
import { postUrl } from '@/lib/post-links.js';

/** After a send: keeps the public link of every post that went out, for the "Just published" list on Distribute. */
export async function recordLinks(userId: string, channels: CarouselChannelRow[], results: Record<string, PublishResult>, caption: string): Promise<void> {
  const items = channels
    .map((channel) => ({ network: channel.kind, url: postUrl(channel.kind, channel, results[channel.id] ?? null), caption }))
    .filter((item): item is { network: CarouselChannelRow['kind']; url: string; caption: string } => Boolean(item.url));
  await recordPublishedPosts(userId, items).catch(() => undefined);
}
