'use client';

import { useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { CarouselMaker } from '@/components/carousel/carousel-maker';

type Kind = 'images' | 'videos';

// What we may build next in Images. Each is honest about being a plan, and "I want this" is a real
// vote: it is counted so the next one built is the one people asked for.
const COMING: { id: string; name: string; line: string }[] = [
  { id: 'single-post', name: 'Single post', line: 'One strong image with a headline, sized for every feed.' },
  { id: 'quote-card', name: 'Quote card', line: 'A quote or a tip on a clean, branded card.' },
  { id: 'story-cover', name: 'Story or Reel cover', line: 'A vertical cover that makes people tap.' },
  { id: 'infographic', name: 'Infographic', line: 'Numbers and steps laid out so they read at a glance.' },
  { id: 'ad-image', name: 'Ad image', line: 'Ad creatives sized for Meta, TikTok and LinkedIn.' },
];

function Lock() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 016 0V9" />
    </svg>
  );
}

// The Create page: first the choice between Images and Videos. Images opens the carousel maker, with
// the other image tools we may add shown (and votable) beside it. Videos is locked while it is built.
export function CreateHub() {
  const [kind, setKind] = useState<Kind>('images');
  const [voted, setVoted] = useState<Record<string, boolean>>({});

  function vote(id: string) {
    if (voted[id]) return;
    setVoted((current) => ({ ...current, [id]: true }));
    trackEvent('create_interest', { status: id });
  }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="What do you want to make?" className="grid max-w-md grid-cols-2 gap-2 rounded-2xl border border-line bg-panel p-1.5">
        <button type="button" role="tab" aria-selected={kind === 'images'} onClick={() => setKind('images')} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${kind === 'images' ? 'bg-ember text-background' : 'text-foreground hover:bg-overlay'}`}>
          Images
        </button>
        <button type="button" role="tab" aria-selected={kind === 'videos'} onClick={() => setKind('videos')} className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${kind === 'videos' ? 'bg-overlay text-foreground' : 'text-muted hover:bg-overlay hover:text-foreground'}`}>
          <Lock />
          Videos
          <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">In development</span>
        </button>
      </div>

      {kind === 'images' ? (
        <>
          <div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Image tools">
              <li className="rounded-2xl border-2 border-ember bg-panel p-4">
                <p className="flex items-center justify-between gap-2">
                  <span className="font-serif text-lg text-foreground">Carousel maker</span>
                  <span className="rounded-full bg-ember/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ember">Live</span>
                </p>
                <p className="mt-1 text-sm text-muted">Swipeable posts for Instagram, TikTok and LinkedIn, from a sentence, with a cover picture made from your topic.</p>
              </li>
              {COMING.map((tool) => (
                <li key={tool.id} className="rounded-2xl border border-line bg-panel/50 p-4">
                  <p className="flex items-center justify-between gap-2">
                    <span className="font-serif text-lg text-muted">{tool.name}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">Soon</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">{tool.line}</p>
                  <button type="button" onClick={() => vote(tool.id)} disabled={voted[tool.id]} className="mt-2 text-xs text-ember underline-offset-2 hover:underline disabled:text-muted disabled:no-underline">
                    {voted[tool.id] ? 'Noted, thanks' : 'I want this'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <CarouselMaker />
        </>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted"><Lock /></span>
          <p className="mt-4 font-serif text-2xl text-foreground">Videos are in development</p>
          <p className="mt-2 max-w-md text-sm text-muted">Short vertical videos from the same idea, with captions and your brand. We are building it now. Want it sooner? Tell us and it moves up.</p>
          <button type="button" onClick={() => vote('video')} disabled={voted.video} className="mt-5 rounded-xl border border-line px-4 py-2.5 text-sm text-foreground transition hover:border-ember disabled:opacity-60">
            {voted.video ? 'Noted, thanks' : 'Tell me when it is ready'}
          </button>
          <button type="button" onClick={() => setKind('images')} className="mt-3 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">Make a carousel meanwhile</button>
        </div>
      )}
    </div>
  );
}
