'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { STYLES as COVER_STYLES } from '@/lib/carousel-cover.js';
import { FORMATS, FORMAT_IDS, KINDS, KIND_IDS, imageCaption, type ImageCopy, type ImageFormat, type ImageKind } from '@/lib/image-kinds.js';
import { THEME_LIST, downscale, loadFonts, loadImage, readDraft, type Brand, type Theme } from '@/components/carousel/carousel-shared';
import { imageFileName, renderImage, saveBlob } from '@/components/image/image-shared';
import { ShareButton } from '@/components/community/share-button';

type Stage = 'ask' | 'working' | 'done';

// What goes into the chat when the image is saved: the words, the look, the size and the background picture.
export type ImageSend = { creation: 'image'; kind: ImageKind; format: ImageFormat; copy: ImageCopy; theme: string; coverStyle: string; brand: Brand; topic: string; coverDataUrl: string | null };

type ImageDraft = { kind: ImageKind; format: ImageFormat; topic: string; button: string; theme: Theme; coverStyle: string; brand: Brand; copy: ImageCopy | null; picture: string | null; seed: string };
type SavedImage = { v: 1; userText: string | null; stage: 'ask' | 'done'; draft: ImageDraft };

const SAVED_EVENT = 'bf:chat-image';
export const imageKey = (conversationId: string | null) => `bf:chat-image:${conversationId ?? 'new'}`;

function freshDraft(kind: ImageKind, topic: string): ImageDraft {
  const saved = readDraft();
  return { kind, format: kind === 'ad' ? 'portrait' : 'square', topic: topic.slice(0, 500), button: '', theme: saved.theme, coverStyle: saved.coverStyle, brand: saved.brand, copy: null, picture: null, seed: 'start' };
}

function readSaved(key: string): SavedImage | null {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as SavedImage) : null;
    return parsed && parsed.v === 1 && parsed.draft ? parsed : null;
  } catch {
    return null;
  }
}

function writeSaved(key: string, value: SavedImage | null) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage full (the picture is large): keep the words and look without it.
    try {
      if (value) window.localStorage.setItem(key, JSON.stringify({ ...value, draft: { ...value.draft, picture: null } }));
    } catch {
      /* storage blocked: the card still works, it just will not come back */
    }
  }
  window.dispatchEvent(new Event(SAVED_EVENT));
}

export function clearSavedImage(key: string) {
  writeSaved(key, null);
}

// A brand-new chat started with an image command: the card waits in it at the question step.
export function seedImageCard(conversationId: string, topic: string, kind: ImageKind = 'ad') {
  writeSaved(imageKey(conversationId), { v: 1, userText: null, stage: 'ask', draft: freshDraft(kind, topic) });
}

function useSavedImage(key: string): boolean {
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

// Shows this chat's saved image card if there is one. Hidden while a new card is open.
export function SavedImageCard({ storageKey, hide, onSend }: { storageKey: string; hide: boolean; onSend: (payload: ImageSend) => Promise<string | null> }) {
  const saved = useSavedImage(storageKey);
  if (hide || !saved) return null;
  return <ImageChatCard key={storageKey} kind="ad" topic="" userText={null} storageKey={storageKey} restore onSend={onSend} onClose={() => undefined} />;
}

const PHASES = [
  { label: 'Brainstorming the angle', hint: 'Finding the line that stops the scroll' },
  { label: 'Writing the words', hint: 'Short, plain and true to what you told me' },
  { label: 'Painting the picture', hint: 'Making a background from your topic' },
  { label: 'Laying it out', hint: 'Fitting words, color and picture together' },
];

const chip = 'rounded-full border px-3 py-1.5 text-xs transition';
const fieldClass = 'mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const kindIcon: Record<ImageKind, string> = {
  ad: 'M4 12l9-6v8zM13 8h3v4h-3',
  quote: 'M5 13c0-3 1-5 3-6M11 13c0-3 1-5 3-6',
  tip: 'M10 3.5a4.5 4.5 0 00-2 8.5v1.5h4V12a4.5 4.5 0 00-2-8.5zM8.5 16h3',
  announcement: 'M4 9v3h3l5 3.5v-10L7 9zM15 8.5a3 3 0 010 4',
  question: 'M5 5h10v7H9l-3 3v-3H5z',
};

// The image makers as a conversation, same as the carousel: the AI asks what it is about, you tap the kind,
// the size and the look, it works in front of you, and the finished image lands in the chat as a message.
// `standalone` is the Create page's version: the same maker, outside a chat, ending in a download.
export function ImageChatCard({ kind: startKind, topic, userText, storageKey, restore, onSend, onClose, standalone = false }: { kind: ImageKind; topic: string; userText: string | null; storageKey: string; restore: boolean; onSend: (payload: ImageSend) => Promise<string | null>; onClose: () => void; standalone?: boolean }) {
  const { openLogin } = useLogin();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [restored] = useState<SavedImage | null>(() => (restore ? readSaved(storageKey) : null));
  const [draft, setDraft] = useState<ImageDraft>(() => restored?.draft ?? freshDraft(startKind, topic));
  const [stage, setStage] = useState<Stage>(restored ? restored.stage : 'ask');
  const [phase, setPhase] = useState(0);
  const [picture, setPicture] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const variant = useRef(0);

  const copy = draft.copy;
  const patch = useCallback((change: Partial<ImageDraft>) => setDraft((current) => ({ ...current, ...change })), []);
  const patchCopy = useCallback((change: Partial<ImageCopy>) => setDraft((current) => (current.copy ? { ...current, copy: { ...current.copy, ...change } } : current)), []);

  useEffect(() => {
    let live = true;
    void loadFonts().then(() => live && setFontsReady(true));
    if (standalone) void getSessionUser().then((user) => live && setSignedIn(Boolean(user))).catch(() => live && setSignedIn(false));
    if (draft.picture) void loadImage(draft.picture).then((image) => live && setPicture(image));
    rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- this runs once, when the card appears
  }, []);

  // The working animation walks through its first steps while the writer does the real work.
  useEffect(() => {
    if (stage !== 'working') return;
    const timer = window.setInterval(() => setPhase((current) => (current >= 1 ? current : current + 1)), 2400);
    return () => window.clearInterval(timer);
  }, [stage]);

  // Keep the card as it is, so it is still here after a refresh. Not while it is working.
  useEffect(() => {
    if (stage === 'working' || (stage === 'ask' && !draft.copy && draft.topic.trim().length < 8)) return;
    writeSaved(storageKey, { v: 1, userText: userText ?? restored?.userText ?? null, stage: stage === 'ask' ? 'ask' : 'done', draft });
  }, [stage, draft, storageKey, userText, restored]);

  useEffect(() => {
    if (stage !== 'done' || !canvasRef.current || !copy || !fontsReady) return;
    renderImage(canvasRef.current, { kind: draft.kind, format: draft.format, copy }, draft.theme, draft.brand, picture, draft.seed);
  }, [stage, draft.kind, draft.format, draft.theme, draft.brand, draft.seed, copy, picture, fontsReady]);

  async function paint(forCopy: ImageCopy, style: string) {
    if (style === 'drawn') {
      setPicture(null);
      patch({ picture: null });
      return;
    }
    setPictureBusy(true);
    try {
      const res = await fetch('/api/carousel/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: forCopy.scene, headline: forCopy.headline.replace(/\*/g, ''), style, variant: variant.current }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setNote(data.error || 'Too many pictures for now.');
        return;
      }
      if (!res.ok || res.status === 204) {
        setNote('Picture-making is busy right now, so the background is drawn art. Try New picture in a minute.');
        return;
      }
      const blob = await res.blob();
      const data = await downscale(new File([blob], 'picture.jpg', { type: blob.type || 'image/jpeg' }), 1080, 'image/jpeg');
      const image = data ? await loadImage(data) : null;
      if (!data || !image) return;
      setPicture(image);
      patch({ picture: data });
    } catch {
      setNote('The picture could not be reached, so the background is drawn art.');
    } finally {
      setPictureBusy(false);
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
    trackEvent('image_chat_started', { source: draft.kind });
    try {
      const res = await fetch('/api/image/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: draft.kind, topic: draft.topic, button: draft.button }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.copy) {
        setError(data.error || 'That did not work. Try again.');
        setStage('ask');
        return;
      }
      const written = data.copy as ImageCopy;
      const seed = `i${[...written.headline].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7)}`;
      variant.current = 0;
      setPicture(null);
      setDraft((current) => ({ ...current, copy: written, picture: null, seed }));
      setPhase(2);
      await paint(written, draft.coverStyle);
      setPhase(3);
      setStage('done');
    } catch {
      setError('Could not reach the writer. Check your connection and try again.');
      setStage('ask');
    }
  }

  function newPicture(style = draft.coverStyle) {
    if (!copy || pictureBusy) return;
    variant.current += 1;
    patch({ coverStyle: style, seed: `v${variant.current}` });
    void paint(copy, style);
  }

  async function save() {
    if (!copy || sending) return;
    setSending(true);
    setError(null);
    const problem = await onSend({ creation: 'image', kind: draft.kind, format: draft.format, copy, theme: draft.theme, coverStyle: draft.coverStyle, brand: draft.brand, topic: draft.topic, coverDataUrl: draft.coverStyle !== 'drawn' ? draft.picture : null });
    if (problem) setError(problem);
    setSending(false);
  }

  // Standalone: download the picture. Guests sign in first; the card is kept in this browser, so it is here when they return.
  async function download() {
    if (!copy) return;
    if (!signedIn) {
      trackEvent('guest_save_clicked', { source: 'image_create' });
      openLogin({ reason: 'carousel', next: window.location.pathname + window.location.search });
      return;
    }
    const canvas = document.createElement('canvas');
    renderImage(canvas, { kind: draft.kind, format: draft.format, copy }, draft.theme, draft.brand, picture, draft.seed);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), 'image/png'));
    if (blob) {
      saveBlob(blob, imageFileName(draft.kind, draft.format));
      trackEvent('image_downloaded', { source: draft.kind });
    }
  }

  async function copyCaption() {
    if (!copy) return;
    try {
      await navigator.clipboard.writeText(imageCaption({ kind: draft.kind, copy }, draft.brand.handle ? `Try it free at ${draft.brand.handle}` : ''));
      setNote('Caption copied.');
    } catch {
      setNote('Could not copy the caption.');
    }
  }

  function startOver() {
    setDraft((current) => ({ ...freshDraft(current.kind, ''), theme: current.theme, coverStyle: current.coverStyle, brand: current.brand }));
    setPicture(null);
    setNote(null);
    setError(null);
    setStage('ask');
  }

  function close() {
    writeSaved(storageKey, null);
    onClose();
  }

  const phaseNow = PHASES[Math.min(phase, PHASES.length - 1)];
  const asking = restored?.userText ?? userText;
  const wantsButton = draft.kind === 'ad' || draft.kind === 'announcement';

  const lookPicker = (size: string) => (
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Look">
      {THEME_LIST.map((theme: { id: string; label: string; accent: string; bg: string }) => (
        <button key={theme.id} type="button" onClick={() => patch({ theme: theme.id as Theme })} aria-pressed={draft.theme === theme.id} aria-label={theme.label} title={theme.label} className={`${size} rounded-full border-2 transition ${draft.theme === theme.id ? 'border-ember ring-2 ring-ember/40' : 'border-line hover:border-muted'}`} style={{ background: `linear-gradient(135deg, ${theme.bg} 50%, ${theme.accent} 50%)` }} />
      ))}
    </div>
  );

  const sizePicker = (
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Size">
      {FORMAT_IDS.map((id: ImageFormat) => (
        <button key={id} type="button" onClick={() => patch({ format: id })} aria-pressed={draft.format === id} className={`${chip} ${draft.format === id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
          {FORMATS[id].label} <span className="text-muted">{FORMATS[id].note}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div ref={rootRef} className={`mx-auto w-full max-w-3xl space-y-3 ${standalone ? '' : 'mt-6'}`} aria-live="polite">
      {asking && !standalone ? (
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-overlay px-4 py-2.5 text-sm text-foreground">{asking}</p>
        </div>
      ) : null}

      <div className="flex gap-3">
        {standalone ? null : (
          <span className="bf-ai-mark flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- bundled local asset at a fixed size */}
            <img src="/discord-server-icon.png" alt="" className="h-full w-full object-cover" />
          </span>
        )}
        <div className="min-w-0 flex-1 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          {stage === 'ask' ? (
            <div>
              <p className="font-serif text-lg text-foreground">{draft.topic.trim().length >= 8 ? 'Got it. Pick the kind and the look, then I will write it.' : 'Let us make an image. What is it for?'}</p>

              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Kind</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Kind of image">
                {KIND_IDS.map((id: ImageKind) => (
                  <button key={id} type="button" onClick={() => patch({ kind: id, format: id === 'ad' && draft.format === 'square' ? 'portrait' : draft.format })} aria-pressed={draft.kind === id} data-tip={KINDS[id].hint} className={`${chip} inline-flex items-center gap-1.5 ${draft.kind === id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={kindIcon[id]} /></svg>
                    {KINDS[id].label}
                  </button>
                ))}
              </div>

              <textarea
                value={draft.topic}
                onChange={(event) => patch({ topic: event.target.value })}
                maxLength={500}
                rows={2}
                autoFocus={draft.topic.trim().length < 8}
                placeholder={KINDS[draft.kind].placeholder}
                aria-label={KINDS[draft.kind].placeholder}
                className="mt-3 w-full resize-none rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none"
              />
              {wantsButton ? (
                <label className="mt-3 block text-xs text-muted">
                  Button says (optional)
                  <input value={draft.button} onChange={(event) => patch({ button: event.target.value })} maxLength={28} placeholder="Try it free" className={fieldClass} />
                </label>
              ) : null}

              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Size</p>
              {sizePicker}
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Look</p>
              {lookPicker('h-9 w-9')}
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Background</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Background style">
                {COVER_STYLES.map((style: { id: string; label: string }) => (
                  <button key={style.id} type="button" onClick={() => patch({ coverStyle: style.id })} aria-pressed={draft.coverStyle === style.id} className={`${chip} ${draft.coverStyle === style.id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                    {style.label}
                  </button>
                ))}
              </div>

              {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
              <div className="mt-5 flex items-center gap-3">
                <button type="button" onClick={() => void make()} disabled={draft.topic.trim().length < 8} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50">
                  Make my {KINDS[draft.kind].label.toLowerCase()}
                </button>
                <button type="button" onClick={close} className="text-sm text-muted transition hover:text-foreground">{standalone ? 'Back' : 'Not now'}</button>
              </div>
            </div>
          ) : null}

          {stage === 'working' ? (
            <div role="status" className="py-2">
              <div className="flex items-end justify-center gap-3" aria-hidden="true">
                {[-6, 0, 6].map((tilt, i) => (
                  <div key={i} className="bf-float relative w-20 overflow-hidden rounded-lg border border-line bg-background shadow-lg sm:w-24" style={{ aspectRatio: i === 1 ? '1 / 1' : i === 0 ? '4 / 5' : '9 / 12', transform: `rotate(${tilt}deg)`, animationDelay: `${i * 0.35}s` }}>
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

          {stage === 'done' && copy ? (
            <div>
              <p className="font-serif text-lg text-foreground">{standalone ? 'Here it is. Change the words or the look, then download it.' : 'Here it is. Change the words or the look, then save it to the chat.'}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr]">
                <div>
                  <div className="relative overflow-hidden rounded-xl border border-line bg-background">
                    <canvas ref={canvasRef} className="mx-auto block h-auto max-h-[34rem] w-auto max-w-full" aria-label={`${KINDS[draft.kind].label} preview`} />
                    {pictureBusy ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs text-foreground" role="status">
                        <span className="rounded-full border border-line bg-panel px-3 py-1.5">Painting a new picture…</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0">
                  <label className="block text-xs text-muted">
                    Headline
                    <input value={copy.headline} onChange={(event) => patchCopy({ headline: event.target.value })} maxLength={128} className={fieldClass} />
                    <span className="mt-1 block text-[11px]">Put *stars* around words to highlight them.</span>
                  </label>
                  {draft.kind === 'ad' || draft.kind === 'announcement' || draft.kind === 'tip' ? (
                    <label className="mt-2 block text-xs text-muted">
                      Supporting line
                      <textarea value={copy.sub} onChange={(event) => patchCopy({ sub: event.target.value })} maxLength={180} rows={2} className={`${fieldClass} resize-none`} />
                    </label>
                  ) : null}
                  {wantsButton ? (
                    <label className="mt-2 block text-xs text-muted">
                      Button
                      <input value={copy.button} onChange={(event) => patchCopy({ button: event.target.value })} maxLength={28} className={fieldClass} />
                    </label>
                  ) : null}
                  {draft.kind === 'question'
                    ? copy.options.map((option, index) => (
                        <label key={index} className="mt-2 block text-xs text-muted">
                          Answer {String.fromCharCode(65 + index)}
                          <input value={option} onChange={(event) => patchCopy({ options: copy.options.map((o, i) => (i === index ? event.target.value : o)) })} maxLength={34} className={fieldClass} />
                        </label>
                      ))
                    : null}

                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Size</p>
                  {sizePicker}
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Look</p>
                  {lookPicker('h-8 w-8')}
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Background</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Background style">
                    {COVER_STYLES.map((style: { id: string; label: string }) => (
                      <button key={style.id} type="button" onClick={() => newPicture(style.id)} disabled={pictureBusy} aria-pressed={draft.coverStyle === style.id} className={`${chip} disabled:opacity-60 ${draft.coverStyle === style.id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                        {style.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => newPicture()} disabled={pictureBusy || draft.coverStyle === 'drawn'} className="mt-2 text-xs text-ember underline-offset-2 hover:underline disabled:text-muted disabled:no-underline">
                    New picture
                  </button>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {standalone ? (
                      <>
                        <button type="button" onClick={() => void download()} disabled={pictureBusy} className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50">
                          {signedIn === false ? 'Sign in to download' : 'Download picture'}
                        </button>
                        <button type="button" onClick={() => void copyCaption()} className="rounded-xl border border-line px-4 py-2.5 text-sm text-foreground transition hover:border-ember">
                          Copy caption
                        </button>
                        <ShareButton
                          kind="create"
                          format={draft.kind}
                          title={copy.headline.replace(/\*/g, '')}
                          caption={imageCaption({ kind: draft.kind, copy }, draft.brand.handle ? `Try it free at ${draft.brand.handle}` : '')}
                          className="rounded-xl border border-line px-4 py-2.5 text-sm text-foreground transition hover:border-ember disabled:opacity-60"
                          getImages={async () => {
                            const canvas = document.createElement('canvas');
                            renderImage(canvas, { kind: draft.kind, format: draft.format, copy }, draft.theme, draft.brand, picture, draft.seed);
                            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), 'image/png'));
                            return blob ? [blob] : [];
                          }}
                        />
                      </>
                    ) : (
                      <button type="button" onClick={() => void save()} disabled={sending || pictureBusy} className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50">
                        {sending ? 'Saving…' : 'Save to chat'}
                      </button>
                    )}
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
