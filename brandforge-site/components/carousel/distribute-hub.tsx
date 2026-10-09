'use client';

import { useEffect, useState } from 'react';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { DistributePreview } from '@/components/carousel/distribute-preview';
import { PostComposer } from '@/components/carousel/post-composer';
import { TYPES, type PostType } from '@/lib/post-types.js';

type Tab = 'carousel' | PostType;
const TABS: [Tab, string][] = [['carousel', 'Carousel'], ['update', TYPES.update.label], ['poll', TYPES.poll.label], ['quiz', TYPES.quiz.label], ['thread', TYPES.thread.label]];

// Distribute: one place to shape a post and send it out. The carousel keeps its platform previews; the
// text-first types (update, poll, quiz, thread) share a composer. The tab is in the address (?type=) so a
// link can open straight to a poll.
export function DistributeHub() {
  const { openLogin } = useLogin();
  const [tab, setTab] = useState<Tab | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    const wanted = new URLSearchParams(window.location.search).get('type');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable in the browser
    setTab(wanted && TABS.some(([id]) => id === wanted) ? (wanted as Tab) : 'carousel');
    void getSessionUser()
      .then((user) => live && setSignedIn(Boolean(user)))
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, []);

  function choose(next: Tab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'carousel') url.searchParams.delete('type');
      else url.searchParams.set('type', next);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* the tab still works without the address */
    }
  }

  return (
    <div>
      <div role="tablist" aria-label="What to post" className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => choose(id)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${tab === id ? 'border-ember bg-ember/15 text-foreground' : 'border-line text-muted hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === null ? null : tab === 'carousel' ? <DistributePreview /> : <PostComposer key={tab} type={tab} signedIn={signedIn} onSignIn={() => openLogin({ reason: 'signin', next: `/distribute?type=${tab}` })} />}
    </div>
  );
}
