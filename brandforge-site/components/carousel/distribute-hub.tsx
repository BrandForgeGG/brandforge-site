'use client';

import { useEffect, useState } from 'react';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { DistributePreview } from '@/components/carousel/distribute-preview';
import { FormatCatalog } from '@/components/carousel/format-catalog';
import { PostComposer } from '@/components/carousel/post-composer';
import type { Format } from '@/lib/format-catalog.js';
import type { ChannelKind } from '@/components/integrations/use-channels';

type Open = { kind: 'carousel' } | { kind: 'post'; type: 'update' | 'poll' | 'quiz' | 'thread'; platform: ChannelKind; name: string };

// Distribute: pick a format, then shape it and send it. The catalog lists every format we are making, by
// platform, with an honest status; only the live ones open. The carousel keeps its platform previews.
// The choice is in the address (?format=) so a link can open straight to a Telegram poll.
export function DistributeHub() {
  const { openLogin } = useLogin();
  const [open, setOpen] = useState<Open | null>(null);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    const wanted = Number(new URLSearchParams(window.location.search).get('format'));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable in the browser
    setReady(true);
    if (Number.isFinite(wanted) && new URLSearchParams(window.location.search).has('format')) {
      import('@/lib/format-catalog.js').then((mod) => {
        const found = mod.FORMATS.find((f: Format) => f.n === wanted && f.status === 'live');
        if (found && live) pick(found, false);
      });
    }
    void getSessionUser()
      .then((user) => live && setSignedIn(Boolean(user)))
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, []);

  function pick(format: Format, scroll = true) {
    const tool = format.tool;
    if (!tool) return;
    setOpen(tool.kind === 'carousel' ? { kind: 'carousel' } : { kind: 'post', type: tool.type, platform: tool.platform, name: format.name });
    try {
      const url = new URL(window.location.href);
      if (format.n === 0) url.searchParams.delete('format');
      else url.searchParams.set('format', String(format.n));
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* the choice still works without the address */
    }
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function back() {
    setOpen({ kind: 'carousel' });
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('format');
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
  }

  if (!ready) return null;
  const current: Open = open ?? { kind: 'carousel' };

  return (
    <div className="space-y-10">
      <div>
        {current.kind === 'post' ? (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={back} className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline">All formats</button>
            <span className="text-muted" aria-hidden="true">/</span>
            <span className="font-serif text-lg text-foreground">{current.name}</span>
          </div>
        ) : null}
        {current.kind === 'carousel' ? (
          <DistributePreview />
        ) : (
          <PostComposer key={current.name} type={current.type} platform={current.platform} signedIn={signedIn} onSignIn={() => openLogin({ reason: 'signin', next: '/distribute' })} />
        )}
      </div>
      <FormatCatalog title="All formats" onPick={pick} />
    </div>
  );
}
