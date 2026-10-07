'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const DISMISS_KEY = 'brandforge:guest-save-dismissed';

// A signed-out visitor gets the answer first. Once the AI has replied, this slim bar
// offers to keep the chat (and add a team) — a nudge, never a wall. The readable
// bf_guest cookie marks a guest browser; signed-in users never see the bar.
export function GuestSaveBar({
  conversationId,
  hasReply,
}: {
  conversationId: string;
  hasReply: boolean;
}) {
  const [isGuest, setIsGuest] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only state
      setIsGuest(document.cookie.split(';').some((part) => part.trim().startsWith('bf_guest=')));
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      // Cookie or storage blocked: stay hidden.
    }
  }, []);

  if (!isGuest || dismissed || !hasReply || !conversationId) return null;

  const next = encodeURIComponent(`/chat?conversationId=${conversationId}`);

  return (
    <div className="px-4 sm:px-6">
      <div
        className="mx-auto mb-1.5 flex max-w-3xl items-center justify-between gap-x-3 rounded-xl border border-ember/30 bg-ember/10 px-3 py-1.5"
        role="region"
        aria-label="Save this chat"
      >
        <p className="min-w-0 text-sm text-foreground">
          Keep this chat and add your team. <span className="hidden text-muted sm:inline">Free, takes 10 seconds.</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/login?next=${next}`}
            className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90"
          >
            Save chat
          </Link>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              try {
                window.sessionStorage.setItem(DISMISS_KEY, '1');
              } catch {}
              setDismissed(true);
            }}
            className="rounded-md px-2 py-1 text-muted transition hover:text-foreground"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
    </div>
  );
}
