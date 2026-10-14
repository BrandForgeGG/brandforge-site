'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { trackEvent } from '@/lib/funnel-client';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { CarouselMaker } from '@/components/carousel/carousel-maker';
import { PostComposer } from '@/components/carousel/post-composer';
import { ImageChatCard, imageKey } from '@/components/chat/image-chat-card';
import { ImageSampleVisual } from '@/components/studio/image-sample-visual';
import { CommunityFeed } from '@/components/community/community-feed';
import { KINDS as IMAGE_KINDS, KIND_IDS as IMAGE_KIND_IDS, type ImageKind } from '@/lib/image-kinds.js';
import { CarouselVisual, DocumentVisual, ImageVisual, OfferVisual, PollVisual, QuizVisual, ThreadVisual, UpdateVisual, VideoVisual } from '@/components/studio/card-visuals';
import type { VideoFormat } from '@/lib/video-scenes.js';

// The video and article makers load only when opened, so Create itself stays light.
const VideoMaker = dynamic(() => import('@/components/video/video-maker').then((mod) => mod.VideoMaker), { ssr: false, loading: () => <div className="bf-skeleton h-64 rounded-2xl bg-overlay" /> });
const LaunchMaker = dynamic(() => import('@/components/video/launch-maker').then((mod) => mod.LaunchMaker), { ssr: false, loading: () => <div className="bf-skeleton h-64 rounded-2xl bg-overlay" /> });
const ArticleMaker = dynamic(() => import('@/components/article/article-maker').then((mod) => mod.ArticleMaker), { ssr: false, loading: () => <div className="bf-skeleton h-64 rounded-2xl bg-overlay" /> });
import { emptyDraft, markResume, writeDraft } from '@/components/carousel/carousel-shared';
import { CREATIONS } from '@/lib/creation-catalog.js';
import type { Format } from '@/lib/format-catalog.js';
import type { PostType } from '@/lib/post-types.js';

// The image makers are cards of their own (image-ad, image-quote, ...): the same maker as in the chat, outside it.
type Kind = 'carousel' | 'deck' | 'article' | 'link' | 'video-launch' | `video-${VideoFormat}` | PostType | `image-${ImageKind}`;
export type StudioKind = Kind;

// What a card that is not built yet looks like: the kind of thing it will make, shown blurred.
const COMING_VISUAL: Record<string, React.ReactNode> = { images: <ImageVisual />, text: <UpdateVisual />, video: <VideoVisual />, documents: <DocumentVisual />, offers: <OfferVisual /> };

const IMAGE_CARD_NAME: Record<ImageKind, string> = { ad: 'Ad image', quote: 'Quote card', tip: 'Tip card', announcement: 'Announcement', question: 'Poll image', cover: 'Story or Reel cover', infographic: 'Infographic', offer: 'Offer card', event: 'Event card', pin: 'Pin' };

type Card = { id: Kind; name: string; line: string; visual: React.ReactNode; group: string };

// Everything Create makes, in the order people look for it.
const CARDS: Card[] = [
  { id: 'carousel', name: 'Carousel', line: 'Swipeable slides from one sentence', visual: <CarouselVisual />, group: 'Images' },
  ...IMAGE_KIND_IDS.map((kind: ImageKind) => ({ id: `image-${kind}` as Kind, name: IMAGE_CARD_NAME[kind], line: IMAGE_KINDS[kind].hint, visual: <ImageSampleVisual kind={kind} />, group: 'Images' })),
  { id: 'video-launch', name: 'Launch video', line: 'Paste your website: a narrated launch video in its own colours', visual: <VideoVisual />, group: 'Video' },
  { id: 'video-short', name: 'Short vertical video', line: 'A clip under a minute, with an optional voice-over', visual: <VideoVisual />, group: 'Video' },
  { id: 'video-long', name: 'Long video', line: 'A widescreen video from the same idea', visual: <VideoVisual />, group: 'Video' },
  { id: 'video-square', name: 'Video carousel', line: 'Square slides that play one after another', visual: <VideoVisual />, group: 'Video' },
  { id: 'update', name: 'Update', line: 'A short post with bold, links and line breaks', visual: <UpdateVisual />, group: 'Text' },
  { id: 'link', name: 'Link post', line: 'A link with your own words that sends people to a page', visual: <UpdateVisual />, group: 'Text' },
  { id: 'poll', name: 'Poll', line: 'A question people vote on', visual: <PollVisual />, group: 'Text' },
  { id: 'quiz', name: 'Quiz', line: 'One right answer and a short explanation', visual: <QuizVisual />, group: 'Text' },
  { id: 'thread', name: 'Thread', line: 'A story told over several linked posts', visual: <ThreadVisual />, group: 'Text' },
  { id: 'deck', name: 'Slide deck', line: 'Slides downloaded as one PDF document', visual: <DocumentVisual />, group: 'Documents' },
  { id: 'article', name: 'Article', line: 'A long-form piece for a blog, LinkedIn or a newsletter', visual: <DocumentVisual />, group: 'Documents' },
];
const CARD_GROUPS = ['Images', 'Video', 'Text', 'Documents'];


// The one page for making things: pick a card, make it, download it, and post or schedule it in Distribute.
// The card you opened is in the address (?make=) so a link can open straight to a poll.
export function StudioHub({ embedded = false, initialKind = null, initialTopic = '' }: { embedded?: boolean; initialKind?: Kind | null; initialTopic?: string } = {}) {
  const { openLogin } = useLogin();
  const [open, setOpen] = useState<Kind | null>(embedded ? initialKind : null);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The formats stay folded away until someone wants to make something; the page opens on what members are making.
  const [picking, setPicking] = useState(false);
  // A topic carried in the address (from Distribute's "Make the picture"): the maker opens already on it.
  const [carried, setCarried] = useState('');
  const [voted, setVoted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let live = true;
    if (embedded) {
      // Opened from the chat: start the carousel on the topic the person just typed.
      if (initialKind === 'carousel' && initialTopic.trim()) {
        writeDraft({ ...emptyDraft(), topic: initialTopic.trim().slice(0, 1500) });
        markResume();
      }
    } else {
      const params = new URLSearchParams(window.location.search);
      const make = params.get('make');
      const topic = (params.get('topic') ?? '').trim().slice(0, 500);
      if (topic) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable in the browser
        setCarried(topic);
        if (make === 'carousel') {
          writeDraft({ ...emptyDraft(), topic: topic.slice(0, 1500) });
          markResume();
        }
      }
      if (make && CARDS.some((card) => card.id === make)) setOpen(make as Kind);
    }
    setReady(true);
    void getSessionUser()
      .then(async (user) => {
        if (!live) return;
        setSignedIn(Boolean(user));
      })
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- this only reads where it was opened from, once
  }, []);

  function show(kind: Kind | null) {
    setOpen(kind);
    if (embedded) return;
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

  function vote(creation: Format) {
    if (voted[creation.n]) return;
    setVoted((current) => ({ ...current, [creation.n]: true }));
    trackEvent('create_interest', { status: `format-${creation.n}` });
  }

  if (!ready) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bf-skeleton h-44 rounded-2xl border border-line bg-panel" />
        ))}
      </div>
    );
  }
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
        {current.id === 'carousel' || current.id === 'deck' ? <CarouselMaker /> : current.id === 'article' ? <ArticleMaker /> : current.id === 'video-launch' ? <LaunchMaker /> : current.id.startsWith('video-') ? <VideoMaker key={current.id} initialFormat={current.id.slice(6) as VideoFormat} /> : current.id.startsWith('image-') ? <ImageChatCard key={current.id} kind={current.id.slice(6) as ImageKind} topic={initialTopic || carried} userText={null} storageKey={imageKey(current.id)} restore={!carried} standalone onSend={async () => null} onClose={() => show(null)} /> : <PostComposer key={current.id} type={(current.id === 'link' ? 'update' : current.id) as PostType} signedIn={signedIn} initialTopic={embedded && current.id === initialKind ? initialTopic : ''} onSignIn={() => openLogin({ reason: 'signin', next: embedded ? window.location.pathname + window.location.search : `/create?make=${current.id}` })} />}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {embedded ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <div className="min-w-0">
            <p className="font-serif text-lg text-foreground">Make something</p>
            <p className="text-sm text-muted">A carousel, an ad, a quote, a tip, a poll and more, from one sentence.</p>
          </div>
          <button type="button" aria-expanded={picking} onClick={() => setPicking((value) => !value)} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90">
            {picking ? 'Close' : 'Choose a format'}
          </button>
        </div>
      )}
      {embedded || picking ? (
      <div className="space-y-10">
      <section aria-label="What do you want to make?">
        <h2 className="font-serif text-2xl text-foreground sm:text-3xl">What do you want to make?</h2>
        {CARD_GROUPS.map((group) => (
          <div key={group} className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{group}</p>
            <ul className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {CARDS.filter((card) => card.group === group).map((card) => (
                <li key={card.id}>
                  <button type="button" onClick={() => show(card.id)} className="group block w-full rounded-2xl border border-line bg-panel p-3 text-left transition hover:border-ember sm:p-4">
                    {card.visual}
                    <span className="mt-3 block font-serif text-lg text-foreground">{card.name}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted sm:text-sm">{card.line}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <details aria-label="Coming soon" className="group">
        <summary className="cursor-pointer text-sm text-muted transition hover:text-foreground">More formats are coming. Tell us which you want.</summary>
        <ul className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {coming.map((creation: Format) => (
            <li key={creation.n}>
              <div className="relative rounded-2xl border border-dashed border-line bg-panel/60 p-3 sm:p-4">
                <div className="relative">
                  <div className="pointer-events-none select-none opacity-60 blur-[3px]" aria-hidden="true">{COMING_VISUAL[creation.group]}</div>
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line bg-background/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground shadow">Coming soon</span>
                </div>
                <span className="mt-3 block font-serif text-lg text-muted">{creation.name}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted sm:text-sm">{creation.line}</span>
                <button type="button" onClick={() => vote(creation)} disabled={voted[creation.n]} className="mt-2 text-xs text-ember underline-offset-2 hover:underline disabled:text-muted disabled:no-underline">
                  {voted[creation.n] ? 'Noted, thanks' : 'I want this'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </details>
      </div>
      ) : null}
      {embedded ? null : <CommunityFeed kind="create" title="Latest creations" />}
    </div>
  );
}
