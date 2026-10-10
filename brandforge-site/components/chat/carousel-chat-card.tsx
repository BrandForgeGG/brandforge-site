'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { getSessionUser } from '@/lib/browser-auth';
import { STYLES as COVER_STYLES } from '@/lib/carousel-cover.js';
import {
  THEME_LIST,
  downscale,
  emptyDraft,
  loadFonts,
  loadImage,
  picturesFromDraft,
  readDraft,
  renderSlide,
  slideCount,
  writeDraft,
  type Draft,
  type Pictures,
  type Theme,
} from '@/components/carousel/carousel-shared';

type Stage = 'ask' | 'working' | 'done';

// What goes into the chat when the carousel is sent: the plan, the look and the cover picture.
export type CarouselSend = { plan: NonNullable<Draft['plan']>; theme: string; coverStyle: string; brand: Draft['brand']; cta: string; topic: string; coverDataUrl: string | null };

// The card is kept: the words, the look and the cover picture are stored in this browser per chat, so a
// refresh or a later visit finds it where it was. Signed-in people also get it saved to their account.
type SavedCard = { v: 1; userText: string | null; stage: 'ask' | 'done'; draft: Draft };

export function clearSavedCard(key: string) {
  writeSaved(key, null);
}
const SAVED_EVENT = 'bf:chat-carousel';
export const cardKey = (conversationId: string | null) => `bf:chat-carousel:${conversationId ?? 'new'}`;

function readSaved(key: string): SavedCard | null {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as SavedCard) : null;
    return parsed && parsed.v === 1 && parsed.draft ? parsed : null;
  } catch {
    return null;
  }
}

function writeSaved(key: string, value: SavedCard | null) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage full (cover pictures are large): keep the words and look without the picture.
    try {
      if (value) window.localStorage.setItem(key, JSON.stringify({ ...value, draft: { ...value.draft, pictures: {} } }));
    } catch {
      /* storage blocked: the card still works, it just will not come back */
    }
  }
  window.dispatchEvent(new Event(SAVED_EVENT));
}

// True when this chat has a saved card. Safe on the server (always false there).
function useSavedCard(key: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(SAVED_EVENT, notify);
      window.addEventListener('storage', notify);
      return () => {
        window.removeEventListener(SAVED_EVENT, notify);
        window.removeEventListener('storage', notify);
      };
    },
    () => readSaved(key) !== null,
    () => false,
  );
}

const PHASES = [
  { label: 'Brainstorming the angle', hint: 'Finding the hook that makes people swipe' },
  { label: 'Writing the slides', hint: 'Three sharp points on every slide' },
  { label: 'Drawing the cover', hint: 'Painting a picture from your topic' },
  { label: 'Laying it out', hint: 'Fitting words, colour and picture together' },
];

const COUNTS = [5, 7, 9];
const chip = 'rounded-full border px-3 py-1.5 text-xs transition';

// Shows this chat's saved card if there is one; otherwise whatever `fallback` is. Hidden while a new card is open.
export function SavedCardOrFallback({ storageKey, hide, fallback, onSend }: { storageKey: string; hide: boolean; fallback: React.ReactNode; onSend: (payload: CarouselSend) => Promise<string | null> }) {
  const saved = useSavedCard(storageKey);
  if (hide) return null;
  return saved ? <CarouselChatCard key={storageKey} topic="" userText={null} storageKey={storageKey} restore onSend={onSend} onClose={() => undefined} /> : <>{fallback}</>;
}

// The carousel maker as a conversation. The AI asks what it is about, you tap a look and a cover style,
// it works in front of you (brainstorming, writing, drawing), and the finished slides land in the chat with
// the buttons to change the look, get new cover art, edit every word or download. Nothing opens beside the
// chat: the whole thing is one card in the thread.
export function CarouselChatCard({ topic, userText, storageKey, restore, onSend, onClose }: { topic: string; userText: string | null; storageKey: string; restore: boolean; onSend: (payload: CarouselSend) => Promise<string | null>; onClose: () => void }) {
  const [restored] = useState<SavedCard | null>(() => (restore ? readSaved(storageKey) : null));
  const [draft, setDraft] = useState<Draft>(() => {
    if (restored) return restored.draft;
    const saved = readDraft();
    return { ...emptyDraft(), brand: saved.brand, cta: saved.cta, theme: saved.theme, coverStyle: saved.coverStyle, logo: saved.logo, count: saved.count, topic: topic.slice(0, 1500) };
  });
  const [pictures, setPictures] = useState<Pictures>({ items: {}, logo: null });
  const [stage, setStage] = useState<Stage>(restored ? restored.stage : 'ask');
  const [phase, setPhase] = useState(0);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const variant = useRef(0);

  const plan = draft.plan;
  const total = slideCount(plan);
  const patch = useCallback((change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change })), []);

  useEffect(() => {
    let live = true;
    void loadFonts().then(() => live && setFontsReady(true));
    void picturesFromDraft(draft).then((loaded) => live && setPictures(loaded));
    rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- this runs once, when the card appears
  }, []);

  // The working animation walks through its steps while the writer does the real work.
  useEffect(() => {
    if (stage !== 'working') return;
    const timer = window.setInterval(() => setPhase((current) => (current >= 1 ? current : current + 1)), 2600);
    return () => window.clearInterval(timer);
  }, [stage]);

  // Keep the card as it is, so it is still here after a refresh. Not while it is working.
  useEffect(() => {
    if (stage === 'working' || (stage === 'ask' && !draft.plan && draft.topic.trim().length < 8)) return;
    writeSaved(storageKey, { v: 1, userText: userText ?? restored?.userText ?? null, stage: stage === 'ask' ? 'ask' : 'done', draft });
  }, [stage, draft, storageKey, userText, restored]);

  useEffect(() => {
    if (stage !== 'done' || !canvasRef.current || !plan || !fontsReady) return;
    renderSlide(canvasRef.current, Math.min(selected, total - 1), draft, pictures);
  }, [stage, draft, pictures, selected, plan, total, fontsReady]);

  async function paintCover(forPlan: NonNullable<Draft['plan']>, style: string) {
    if (style === 'drawn') {
      setPictures((current) => ({ ...current, items: { ...current.items, [-1]: null } }));
      return;
    }
    setCoverBusy(true);
    try {
      const res = await fetch('/api/carousel/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: forPlan.cover.scene ?? '', headline: forPlan.cover.headline, style, variant: variant.current }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setNote(data.error || 'Too much cover art for now.');
        return;
      }
      if (!res.ok || res.status === 204) {
        setNote('Cover art is busy right now, so the cover uses the drawn art. Try New cover art in a minute.');
        return;
      }
      const blob = await res.blob();
      const data = await downscale(new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' }), 1080, 'image/jpeg');
      const img = data ? await loadImage(data) : null;
      if (!data || !img) return;
      setPictures((current) => ({ ...current, items: { ...current.items, [-1]: img } }));
      setDraft((current) => ({ ...current, pictures: { ...current.pictures, [-1]: data } }));
      setSelected(0);
    } catch {
      setNote('Cover art could not be reached, so the cover uses the drawn art.');
    } finally {
      setCoverBusy(false);
    }
  }

  async function make() {
    if (draft.topic.trim().length < 8) {
      setError('Say what it is about in a sentence.');
      return;
    }
    setError(null);
    setNote(null);
    setPhase(0);
    setStage('working');
    trackEvent('carousel_chat_started', { source: 'chat' });
    try {
      const res = await fetch('/api/carousel/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'words', type: 'list', topic: draft.topic, count: draft.count, cta: draft.cta }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'That did not work. Try again.');
        setStage('ask');
        return;
      }
      const seed = `w${[...String(data.plan.cover.headline)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7)}`;
      setDraft((current) => ({ ...current, plan: data.plan, source: null, captions: {}, id: null, pictures: {}, seed }));
      setPictures((current) => ({ ...current, items: {} }));
      setSelected(0);
      variant.current = 0;
      setPhase(2);
      await paintCover(data.plan, draft.coverStyle);
      setPhase(3);
      setStage('done');
      void saveToAccount(data.plan);
    } catch {
      setError('Could not reach the writer. Check your connection and try again.');
      setStage('ask');
    }
  }

  // Signed-in people keep the words and look in their account too (pictures stay on this device).
  async function saveToAccount(forPlan: NonNullable<Draft['plan']>) {
    try {
      const user = await getSessionUser();
      if (!user) return;
      const res = await fetch('/api/carousel/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: null, plan: forPlan, type: draft.type, theme: draft.theme, brand: draft.brand, captions: {} }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.carousel?.id) {
        setDraft((current) => ({ ...current, id: data.carousel.id }));
        setNote('Saved to your account. Find it on the Create page any time.');
      }
    } catch {
      /* saving to the account is a bonus; the card is kept on this device either way */
    }
  }

  function close() {
    writeSaved(storageKey, null);
    onClose();
  }

  function newCover(style = draft.coverStyle) {
    if (!plan || coverBusy) return;
    variant.current += 1;
    patch({ seed: `v${variant.current}`, coverStyle: style });
    void paintCover(plan, style);
  }

  // Sending puts the carousel into the chat as a message with its own date. The chat's own page does the work
  // (it may need to start the chat first) and answers with an error message, or nothing when it went through.
  async function sendToChat() {
    if (!plan || sending) return;
    setSending(true);
    setError(null);
    const cover = draft.coverStyle !== 'drawn' ? (draft.pictures[-1] ?? null) : null;
    const problem = await onSend({ plan, theme: draft.theme, coverStyle: draft.coverStyle, brand: draft.brand, cta: draft.cta, topic: draft.topic, coverDataUrl: cover });
    if (problem) setError(problem);
    setSending(false);
  }

  function startOver() {
    setDraft((current) => ({ ...emptyDraft(), brand: current.brand, cta: current.cta, theme: current.theme, coverStyle: current.coverStyle, logo: current.logo, count: current.count }));
    setPictures((current) => ({ items: {}, logo: current.logo }));
    setSelected(0);
    setNote(null);
    setError(null);
    setStage('ask');
  }

  const phaseNow = PHASES[Math.min(phase, PHASES.length - 1)];

  return (
    <div ref={rootRef} className="mx-auto mt-6 w-full max-w-3xl space-y-3" aria-live="polite">
      {(userText ?? restored?.userText) ? (
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-overlay px-4 py-2.5 text-sm text-foreground">{userText ?? restored?.userText}</p>
        </div>
      ) : null}

      <div className="flex gap-3">
        <span className="bf-ai-mark flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- bundled local asset at a fixed size */}
          <img src="/discord-server-icon.png" alt="" className="h-full w-full object-cover" />
        </span>
        <div className="min-w-0 flex-1 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          {stage === 'ask' ? (
            <div>
              <p className="font-serif text-lg text-foreground">{draft.topic.trim().length >= 8 ? 'Got it. Pick a look, then I will write it.' : 'Let us make a carousel. What is it about?'}</p>
              <textarea
                value={draft.topic}
                onChange={(event) => patch({ topic: event.target.value })}
                maxLength={1500}
                rows={2}
                autoFocus={draft.topic.trim().length < 8}
                placeholder="Seven mistakes first-time founders make with their landing page"
                aria-label="What is the carousel about?"
                className="mt-3 w-full resize-none rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none"
              />

              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Look</p>
              <div className="mt-2 flex flex-wrap gap-2.5" role="group" aria-label="Look">
                {THEME_LIST.map((theme: { id: string; label: string; accent: string; bg: string }) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => patch({ theme: theme.id as Theme })}
                    aria-pressed={draft.theme === theme.id}
                    aria-label={theme.label}
                    title={theme.label}
                    className={`h-9 w-9 rounded-full border-2 transition ${draft.theme === theme.id ? 'border-ember ring-2 ring-ember/40' : 'border-line hover:border-muted'}`}
                    style={{ background: `linear-gradient(135deg, ${theme.bg} 50%, ${theme.accent} 50%)` }}
                  />
                ))}
                <span className="self-center text-xs text-muted">{THEME_LIST.find((theme: { id: string; label: string }) => theme.id === draft.theme)?.label}</span>
              </div>

              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Cover</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Cover art style">
                {COVER_STYLES.map((style: { id: string; label: string }) => (
                  <button key={style.id} type="button" onClick={() => patch({ coverStyle: style.id })} aria-pressed={draft.coverStyle === style.id} className={`${chip} ${draft.coverStyle === style.id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                    {style.label}
                  </button>
                ))}
              </div>

              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Slides</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Number of points">
                {COUNTS.map((count) => (
                  <button key={count} type="button" onClick={() => patch({ count })} aria-pressed={draft.count === count} className={`${chip} ${draft.count === count ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                    {count} points
                  </button>
                ))}
              </div>

              {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
              <div className="mt-5 flex items-center gap-3">
                <button type="button" onClick={() => void make()} disabled={draft.topic.trim().length < 8} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50">
                  Make my carousel
                </button>
                <button type="button" onClick={close} className="text-sm text-muted transition hover:text-foreground">Not now</button>
              </div>
            </div>
          ) : null}

          {stage === 'working' ? (
            <div role="status" className="py-2">
              <div className="flex items-end justify-center gap-3" aria-hidden="true">
                {[-7, 0, 7].map((tilt, i) => (
                  <div key={i} className="bf-float relative aspect-[4/5] w-16 overflow-hidden rounded-lg border border-line bg-background shadow-lg sm:w-20" style={{ transform: `rotate(${tilt}deg)`, animationDelay: `${i * 0.35}s` }}>
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-ember/25 to-transparent" style={{ animationDelay: `${i * 0.3}s` }} />
                    <div className="absolute inset-x-2 bottom-3 space-y-1">
                      <div className="h-1.5 w-5/6 rounded-sm bg-foreground/50" />
                      <div className="h-1.5 w-3/5 rounded-sm bg-ember" />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-center font-serif text-lg text-foreground">
                {phaseNow.label}
                <span className="ml-1 inline-flex gap-0.5 align-middle" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="bf-dot h-1.5 w-1.5 rounded-full bg-ember" style={{ animationDelay: `${i * 0.18}s` }} />
                  ))}
                </span>
              </p>
              <p className="mt-1 text-center text-xs text-muted">{phaseNow.hint}</p>
              <ol className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
                {PHASES.map((step, i) => (
                  <li key={step.label} className={`h-1 w-8 rounded-full transition-colors duration-500 ${i <= phase ? 'bg-ember' : 'bg-line'}`} />
                ))}
              </ol>
            </div>
          ) : null}

          {stage === 'done' && plan ? (
            <div>
              <p className="font-serif text-lg text-foreground">Here it is. Pick the look, then send it to the chat.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,17rem)_1fr]">
                <div>
                  <div className="relative overflow-hidden rounded-xl border border-line bg-background">
                    <canvas ref={canvasRef} className="block h-auto w-full" style={{ aspectRatio: '4 / 5' }} aria-label={`Slide ${selected + 1} of ${total}`} />
                    {coverBusy ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs text-foreground" role="status">
                        <span className="rounded-full border border-line bg-panel px-3 py-1.5">Drawing a new cover…</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setSelected((i) => Math.max(0, i - 1))} disabled={selected === 0} className="rounded-lg border border-line px-3 py-1.5 text-sm text-foreground disabled:opacity-40" aria-label="Previous slide">←</button>
                    <div className="flex flex-wrap justify-center gap-1" role="group" aria-label="Slides">
                      {Array.from({ length: total }, (_, i) => (
                        <button key={i} type="button" onClick={() => setSelected(i)} aria-label={`Slide ${i + 1}`} aria-current={i === selected} className={`h-2 rounded-full transition-all ${i === selected ? 'w-5 bg-ember' : 'w-2 bg-line hover:bg-muted'}`} />
                      ))}
                    </div>
                    <button type="button" onClick={() => setSelected((i) => Math.min(total - 1, i + 1))} disabled={selected >= total - 1} className="rounded-lg border border-line px-3 py-1.5 text-sm text-foreground disabled:opacity-40" aria-label="Next slide">→</button>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Look</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Look">
                    {THEME_LIST.map((theme: { id: string; label: string; accent: string; bg: string }) => (
                      <button key={theme.id} type="button" onClick={() => patch({ theme: theme.id as Theme })} aria-pressed={draft.theme === theme.id} aria-label={theme.label} title={theme.label} className={`h-8 w-8 rounded-full border-2 transition ${draft.theme === theme.id ? 'border-ember ring-2 ring-ember/40' : 'border-line hover:border-muted'}`} style={{ background: `linear-gradient(135deg, ${theme.bg} 50%, ${theme.accent} 50%)` }} />
                    ))}
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Cover</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Cover art style">
                    {COVER_STYLES.map((style: { id: string; label: string }) => (
                      <button key={style.id} type="button" onClick={() => newCover(style.id)} disabled={coverBusy} aria-pressed={draft.coverStyle === style.id} className={`${chip} disabled:opacity-60 ${draft.coverStyle === style.id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                        {style.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => newCover()} disabled={coverBusy || draft.coverStyle === 'drawn'} className="mt-2 text-xs text-ember underline-offset-2 hover:underline disabled:text-muted disabled:no-underline">
                    New cover art
                  </button>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void sendToChat()} disabled={sending || coverBusy} className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50">
                      {sending ? 'Sending…' : 'Send to chat'}
                    </button>
                    <button type="button" onClick={startOver} className="rounded-xl px-3 py-2.5 text-sm text-muted transition hover:text-foreground">
                      Start over
                    </button>
                  </div>
                  {note ? <p role="status" className="mt-3 text-xs text-muted">{note}</p> : null}
                  {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
                </div>
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}
