'use client';

import { useState } from 'react';

// Appears once a chat holds at least two images and nothing is being written: the images become a
// video in one click. Dismissible, never blocks the composer.
export function VideoReadyBar({
  count,
  busy,
  onOpen,
}: {
  count: number;
  busy: boolean;
  onOpen: () => void;
}) {
  const [dismissedAt, setDismissedAt] = useState(0);
  // Dismissal only holds until a new image arrives.
  if (busy || count < 2 || dismissedAt === count) return null;

  return (
    <div className="px-4 sm:px-6">
      <div
        className="mx-auto mb-1.5 flex max-w-3xl items-center justify-between gap-x-3 rounded-xl border border-line bg-panel px-3 py-1.5"
        role="region"
        aria-label="Video ready"
      >
        <p className="min-w-0 truncate text-sm text-foreground">{count} images ready for a video</p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90"
          >
            Make video
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissedAt(count)}
            className="rounded-md px-2 py-1 text-muted transition hover:text-foreground"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
    </div>
  );
}
