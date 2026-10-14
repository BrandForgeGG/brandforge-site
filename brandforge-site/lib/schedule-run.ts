import { claimDueScheduledPosts, downloadScheduledImage, finishScheduledPost, listCarouselChannels, removeScheduledImages } from '@/lib/project-db';
import { publishToChannel } from '@/lib/carousel-channels';
import { MAX_ATTEMPTS, outcomeOf } from '@/lib/schedule.js';
import { recordLinks } from '@/lib/publish-links';

// The sender: takes the posts that are due, sends each to the channels its owner chose, and records what happened. A post
// whose channels all failed is tried again on a later run (up to three tries); one that went out has its pictures deleted.
export async function runDueScheduledPosts(): Promise<{ ran: number; done: number; partial: number; failed: number; retry: number }> {
  const claimed = await claimDueScheduledPosts(10);
  const totals = { ran: claimed.length, done: 0, partial: 0, failed: 0, retry: 0 };
  for (const row of claimed) {
    const channels = (await listCarouselChannels(row.user_id)).filter((c) => row.channel_ids.includes(c.id));
    const images: Buffer[] = [];
    for (const path of row.image_paths) {
      const bytes = await downloadScheduledImage(path);
      if (bytes) images.push(bytes);
    }
    const results: Record<string, { ok: boolean; note?: string; ref?: string; url?: string }> = {};
    if (images.length === 0) {
      for (const id of row.channel_ids) results[id] = { ok: false, note: 'The pictures are gone.' };
    } else if (channels.length === 0) {
      results.none = { ok: false, note: 'None of the chosen channels is linked any more.' };
    } else {
      for (const channel of channels) {
        try {
          results[channel.id] = await publishToChannel(channel, images, row.caption);
        } catch {
          results[channel.id] = { ok: false, note: 'Could not send.' };
        }
      }
    }
    if (channels.length > 0) await recordLinks(row.user_id, channels, results, row.caption, images[0] ?? null);
    const outcome = outcomeOf(results);
    const attempts = row.attempts + 1;
    const again = outcome === 'failed' && attempts < MAX_ATTEMPTS && images.length > 0 && channels.length > 0;
    await finishScheduledPost(row.id, { status: again ? 'scheduled' : outcome, results, attempts, sent: outcome !== 'failed' });
    if (again) totals.retry += 1;
    else totals[outcome] += 1;
    if (!again) await removeScheduledImages(row.image_paths);
  }
  return totals;
}
