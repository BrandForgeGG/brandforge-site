'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { trackEvent } from '@/lib/funnel-client';
import { fetchAuthed, getSessionUser } from '@/lib/browser-auth';
import { useRouter } from 'next/navigation';
import { isMakerKind, seedMakerCard } from '@/components/chat/maker-chat-card';
import { seedCarouselCard } from '@/components/chat/carousel-chat-card';
import { seedImageCard } from '@/components/chat/image-chat-card';
import { CreationsList } from '@/components/studio/creations-list';
import { useLogin } from '@/components/login-dialog';
import { CarouselMaker } from '@/components/carousel/carousel-maker';
import { PostComposer } from '@/components/carousel/post-composer';
import { ImageChatCard, imageKey } from '@/components/chat/image-chat-card';
import { ImageSampleVisual } from '@/components/studio/image-sample-visual';
import { CommunityFeed } from '@/components/community/community-feed';
import { DraftsList } from '@/components/drafts/drafts-list';
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
  // A format opens folded (its drafts and a start button); the maker shows once asked for. In the chat it opens at once.
  const [building, setBuilding] = useState(embedded);
  // The draft the maker was opened on (from the list, or from the address after a refresh).
  const [openedDraft, setOpenedDraft] = useState<string | null>(null);
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
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
      if (make && CARDS.some((card) => card.id === make)) {
        setOpen(make as Kind);
        const draft = params.get('draft');
        if (draft) setOpenedDraft(draft);
        // A draft being worked on, or a topic handed over from Distribute, opens straight into the maker.
        if (draft || topic) setBuilding(true);
      }
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

  function show(kind: Kind | null, opts: { draft?: string; build?: boolean } = {}) {
    setOpen(kind);
    setOpenedDraft(opts.draft ?? null);
    setBuilding(embedded || Boolean(opts.build));
    if (embedded) return;
    try {
      const url = new URL(window.location.href);
      if (kind) url.searchParams.set('make', kind);
      else url.searchParams.delete('make');
      if (opts.draft) url.searchParams.set('draft', opts.draft);
      else url.searchParams.delete('draft');
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* the page still works without the address */
    }
    window.scrollTo({ top: 0 });
  }

  // A maker named its new draft: the address carries it, so a refresh reopens the same work.
  function rememberDraft(id: string) {
    if (embedded) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('draft', id);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* the draft is still in the list */
    }
  }

  // Carousels, pictures, videos and articles are made in a chat of their own: the chat is the creation's draft and
  // history, where every version lands and can be changed. Create starts that chat with the maker already open in it.
  const madeInChat = (kind: Kind) => kind === 'carousel' || kind.startsWith('image-') || isMakerKind(kind);
  async function startInChat(card: Card) {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const signed = Boolean(await getSessionUser().catch(() => null));
      const res = await (signed ? fetchAuthed : fetch)('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialMessage: `Make a ${card.name.toLowerCase()}`, ...(signed ? {} : { guest: true }) }),
      });
      const data = (await res.json().catch(() => ({}))) as { conversationId?: string; error?: string };
      if (!res.ok || !data.conversationId) throw new Error(data.error || 'Could not start the chat. Try again.');
      const id = data.conversationId;
      try {
        window.sessionStorage.setItem(`bf:no-auto-answer:${id}`, '1');
      } catch {
        /* the AI may answer the first line as well */
      }
      if (isMakerKind(card.id)) seedMakerCard(id, card.id);
      else if (card.id === 'carousel') seedCarouselCard(id, carried);
      else seedImageCard(id, carried, card.id.slice(6) as ImageKind);
      trackEvent('next_step_clicked', { source: `create-${card.id}` });
      router.push(`/chat?conversationId=${id}`);
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : 'Could not start the chat. Try again.');
      setStarting(false);
    }
  }

  const labelOf = (kind: string) => CARDS.find((card) => card.id === kind)?.name ?? 'Draft';

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
        {building ? (
          current.id === 'carousel' || current.id === 'deck' ? <CarouselMaker /> : current.id === 'article' ? <ArticleMaker key={openedDraft ?? 'new'} draftId={openedDraft ?? undefined} onDraftId={rememberDraft} /> : current.id === 'video-launch' ? <LaunchMaker key={openedDraft ?? 'new'} draftId={openedDraft ?? undefined} onDraftId={rememberDraft} /> : current.id.startsWith('video-') ? <VideoMaker key={`${current.id}:${openedDraft ?? 'new'}`} initialFormat={current.id.slice(6) as VideoFormat} draftId={openedDraft ?? undefined} onDraftId={rememberDraft} /> : current.id.startsWith('image-') ? <ImageChatCard key={current.id} kind={current.id.slice(6) as ImageKind} topic={initialTopic || carried} userText={null} storageKey={imageKey(current.id)} restore={!carried} standalone onSend={async () => null} onClose={() => show(null)} /> : <PostComposer key={current.id} type={(current.id === 'link' ? 'update' : current.id) as PostType} signedIn={signedIn} initialTopic={embedded && current.id === initialKind ? initialTopic : ''} onSignIn={() => openLogin({ reason: 'signin', next: embedded ? window.location.pathname + window.location.search : `/create?make=${current.id}` })} />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="min-w-0">
                <p className="font-serif text-lg text-foreground">{current.name}</p>
                <p className="text-sm text-muted">{current.line}</p>
              </div>
              <button type="button" onClick={() => (madeInChat(current.id) ? void startInChat(current) : setBuilding(true))} disabled={starting} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">
                {starting ? 'Opening a chat…' : 'Start making'}
              </button>
            </div>
            {startError ? <p role="alert" className="text-sm text-danger">{startError}</p> : null}
            {madeInChat(current.id) ? <CreationsList card={current.id} title={`Your ${current.name.toLowerCase()}s`} /> : null}
            <DraftsList kind={current.id} labelOf={labelOf} onOpen={(draft) => show(draft.kind as Kind, { draft: draft.id, build: true })} title="On this device" />
          </div>
        )}
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
      {embedded ? null : <CreationsList />}
      {embedded ? null : <DraftsList labelOf={labelOf} onOpen={(draft) => show(draft.kind as Kind, { draft: draft.id, build: true })} title="On this device" />}
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
