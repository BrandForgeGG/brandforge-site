'use client';

import { DistributePreview } from '@/components/carousel/distribute-preview';

// Distribute shows only what is live: previews, captions, plans and posting for a carousel. The text-first
// post types (update, poll, quiz, thread) are built (components/carousel/post-composer.tsx) and can be
// shown again here when they are wanted.
export function DistributeHub() {
  return <DistributePreview />;
}
