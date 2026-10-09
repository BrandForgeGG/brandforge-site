'use client';

import { useEffect, useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { CarouselMaker } from '@/components/carousel/carousel-maker';
import { PostComposer } from '@/components/carousel/post-composer';
import { CarouselVisual, PollVisual, QuizVisual, ThreadVisual, UpdateVisual } from '@/components/studio/card-visuals';
import { emptyDraft, markResume, writeDraft, type Draft } from '@/components/carousel/carousel-shared';
import { CREATIONS } from '@/lib/creation-catalog.js';
import type { Format } from '@/lib/format-catalog.js';
import type { PostType } from '@/lib/post-types.js';

type Kind = 'carousel' | PostType;

const CARDS: { id: Kind; name: string; line: string; visual: React.ReactNode }[] = [
  { id: 'carousel', name: 'Carousel', line: 'Swipeable slides from one sentence', visual: <CarouselVisual /> },
  { id: 'update', name: 'Update', line: 'A short post with bold and links', visual: <UpdateVisual /> },
  { id: 'poll', name: 'Poll', line: 'Ask a question, get votes', visual: <PollVisual /> },
  { id: 'quiz', name: 'Quiz', line: 'One right answer, one reason', visual: <QuizVisual /> },
  { id: 'thread', name: 'Thread', line: 'A story over linked posts', visual: <ThreadVisual /> },
];

type Saved = { id: string; title: string; type: string; theme: string; plan: Draft['plan']; brand: Draft['brand']; captions: Record<string, string> };

// The one page for making things: pick a card, make it, download it, and publish when publishing opens.
// The card you opened is in the address (?make=) so a link can open straight to a poll.
export function StudioHub() {
  const { openLogin } = useLogin();
  const [open, setOpen] = useState<Kind | null>(null);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [voted, setVoted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let live = true;
    const make = new URLSearchParams(window.location.search).get('make');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable in the browser
    if (make && CARDS.some((card) => card.id === make)) setOpen(make as Kind);
    setReady(true);
    void getSessionUser()
      .then(async (user) => {
        if (!live) return;
        setSignedIn(Boolean(user));
        if (!user) return;
        const res = await fetch('/api/carousel/drafts').catch(() => null);
        if (res && res.ok && live) setSaved((((await res.json()) as { carousels: Saved[] }).carousels ?? []).slice(0, 4));
      })
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, []);

  function show(kind: Kind | null) {
    setOpen(kind);
    try {
      const url = new URL(window.location.href);
      if (kind) url.searchParams.set('make', kind);
      else url.searchParams.delete('make');
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* the page still works without the address */
    }
    window.scrollTo({ top: 0 });
  }

  function openSaved(row: Saved) {
    writeDraft({ ...emptyDraft(), id: row.id, plan: row.plan, type: row.type, theme: row.theme as Draft['theme'], brand: row.brand, captions: row.captions ?? {}, seed: row.id.slice(0, 6) });
    markResume();
    show('carousel');
  }

  function vote(creation: Format) {
    if (voted[creation.n]) return;
    setVoted((current) => ({ ...current, [creation.n]: true }));
    trackEvent('create_interest', { status: `format-${creation.n}` });
  }

  if (!ready) return null;
  const coming = CREATIONS.filter((c: Format) => c.status !== 'live');
  const current = CARDS.find((card) => card.id === open);

  if (current) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <button type="button" onClick={() => show(null)} className="flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground">
            <span aria-hidden="true">←</span> All formats
          </button>
          <span className="text-muted" aria-hidden="true">/</span>
          <h2 className="font-serif text-xl text-foreground">{current.name}</h2>
        </div>
        {current.id === 'carousel' ? <CarouselMaker /> : <PostComposer key={current.id} type={current.id} signedIn={signedIn} onSignIn={() => openLogin({ reason: 'signin', next: `/create?make=${current.id}` })} />}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section aria-label="What do you want to make?">
        <h2 className="font-serif text-2xl text-foreground sm:text-3xl">What do you want to make?</h2>
        <ul className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {CARDS.map((card) => (
            <li key={card.id}>
              <button type="button" onClick={() => show(card.id)} className="group block w-full rounded-2xl border border-line bg-panel p-3 text-left transition hover:border-ember sm:p-4">
                {card.visual}
                <span className="mt-3 block font-serif text-lg text-foreground">{card.name}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted sm:text-sm">{card.line}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {saved.length > 0 ? (
        <section aria-label="Your saved carousels">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Pick up where you left off</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {saved.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => openSaved(row)} className="max-w-[16rem] truncate rounded-full border border-line px-3.5 py-1.5 text-sm text-foreground transition hover:border-ember">
                  {row.title || 'Untitled carousel'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Coming next">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Coming next</p>
        <p className="mt-1 text-xs text-muted">Tap the ones you want. They move up.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {coming.map((creation: Format) => (
            <li key={creation.n}>
              <button type="button" onClick={() => vote(creation)} disabled={voted[creation.n]} title={creation.line} className="rounded-full border border-dashed border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember hover:text-foreground disabled:border-ember/40 disabled:text-ember">
                {voted[creation.n] ? `${creation.name}: noted` : creation.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
