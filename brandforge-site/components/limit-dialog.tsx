'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { limitMessage, type LimitKind } from '@/lib/free-limits.js';

// When a Free allowance runs out anywhere on the site, one prompt: Pro, or a team. Every limited route answers 402 with
// { code: 'limit', kind }; this listens to the page's own requests for that answer (and to ?limit= after a redirect), so no
// maker has to know about plans.
export function LimitDialog() {
  const [kind, setKind] = useState<LimitKind | null>(null);
  const [tier, setTier] = useState('free');

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('limit');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a redirect from a connect page carries the limit
    if (fromUrl === 'channel' || fromUrl === 'creation' || fromUrl === 'video') setKind(fromUrl);

    const original = window.fetch;
    const watched: typeof fetch = async (...args) => {
      const response = await original(...args);
      if (response.status === 402) {
        void response
          .clone()
          .json()
          .then((data: { code?: string; kind?: string; tier?: string }) => {
            if (data?.code !== 'limit' || !(data.kind === 'creation' || data.kind === 'video' || data.kind === 'channel')) return;
            setTier(data.tier === 'pro' ? 'pro' : 'free');
            setKind(data.kind);
          })
          .catch(() => undefined);
      }
      return response;
    };
    window.fetch = watched;
    return () => {
      if (window.fetch === watched) window.fetch = original;
    };
  }, []);

  if (!kind) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="limit-title" className="fixed inset-0 z-[90] flex items-end justify-center bg-foreground/50 p-4 sm:items-center" onClick={() => setKind(null)}>
      <div className="w-full max-w-sm rounded-3xl border border-line bg-panel p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && setKind(null)}>
        <p id="limit-title" className="font-serif text-2xl text-foreground">{tier === 'pro' ? 'This month is used up' : 'Free is used up'}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{limitMessage(kind, tier)}</p>
        <div className="mt-5 space-y-2">
          {tier === 'pro' ? null : <Link href="/pricing#software" onClick={() => setKind(null)} className="block rounded-xl bg-ember px-4 py-2.5 text-center text-sm font-semibold text-on-ember transition hover:opacity-90">Go Pro · €19/mo</Link>}
          <Link href="/pricing#plans" onClick={() => setKind(null)} className="block rounded-xl border border-line px-4 py-2.5 text-center text-sm font-semibold text-foreground transition hover:border-ember">Get a team to do it</Link>
          <button type="button" autoFocus onClick={() => setKind(null)} className="block w-full pt-1 text-center text-xs text-muted hover:text-foreground">Not now</button>
        </div>
      </div>
    </div>
  );
}
