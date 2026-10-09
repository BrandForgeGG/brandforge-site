'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PLATFORMS, fallbackCaptions } from '@/lib/carousel-captions.js';
import { zipStore } from '@/lib/zip-store.js';
import { trackEvent } from '@/lib/funnel-client';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { ChannelPoster } from '@/components/carousel/channel-poster';
import {
  W,
  H,
  emptyDraft,
  loadFonts,
  picturesFromDraft,
  readDraft,
  renderSlide,
  slideCount,
  slideFileName,
  writeDraft,
  type Draft,
  type Pictures,
} from '@/components/carousel/carousel-shared';

type PlatformId = keyof typeof PLATFORMS;
type Saved = { id: string; title: string; type: string; theme: string; plan: Draft['plan']; brand: Draft['brand']; captions: Record<string, string>; planned_for: string | null; updated_at: string };

const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];
const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50';
const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';

// Where each platform cuts a caption off with "more", so the preview is honest about what shows first.
const FOLD: Record<PlatformId, number> = { instagram: 125, tiktok: 90, linkedin: 210, x: 280, facebook: 125 };

function localInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The step after making a carousel: see it the way each platform will show it, get a caption written
// for each, and plan when to post. Anyone can preview; saving a plan, downloading and scheduling need
// a free account. Direct posting to the platforms is not live, and the page says so plainly.
export function DistributePreview() {
  const { openLogin } = useLogin();
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [pictures, setPictures] = useState<Pictures>({ items: {}, logo: null });
  const [loaded, setLoaded] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [platform, setPlatform] = useState<PlatformId>('instagram');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [planned, setPlanned] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const plan = draft.plan;
  const total = slideCount(plan);
  const patch = useCallback((change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change })), []);

  useEffect(() => {
    let live = true;
    const current = readDraft();
    void picturesFromDraft(current).then((restored) => {
      if (!live) return;
      setDraft(current);
      setPictures(restored);
      setLoaded(true);
    });
    void loadFonts().then(() => {
      if (live) setFontsReady(true);
    });
    void getSessionUser()
      .then(async (user) => {
        if (!live) return;
        setSignedIn(Boolean(user));
        if (!user) return;
        const res = await fetch('/api/carousel/drafts').catch(() => null);
        if (res && res.ok && live) setSaved(((await res.json()) as { carousels: Saved[] }).carousels ?? []);
      })
      .catch(() => {
        if (live) setSignedIn(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (loaded) writeDraft(draft);
  }, [draft, loaded]);

  useEffect(() => {
    if (canvasRef.current && plan && fontsReady && loaded) renderSlide(canvasRef.current, Math.min(index, total - 1), draft, pictures);
  }, [draft, pictures, index, plan, total, fontsReady, loaded]);

  // Captions: what the person wrote or had written, otherwise one built from the carousel itself.
  const captions = useMemo(() => {
    if (!plan) return {} as Record<string, string>;
    return { ...fallbackCaptions(plan, draft.cta), ...draft.captions } as Record<string, string>;
  }, [plan, draft.cta, draft.captions]);
  const caption = captions[platform] ?? '';
  const limit = PLATFORMS[platform].limit;

  function setCaption(value: string) {
    patch({ captions: { ...draft.captions, [platform]: value.slice(0, limit) } });
  }

  async function writeCaptions() {
    if (!plan) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/carousel/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, topic: draft.topic, brand: draft.brand, cta: draft.cta }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setNote(data.error || 'Could not write captions.');
      patch({ captions: data.captions });
      setNote(data.written ? 'Captions written for every platform. Edit them freely.' : 'The writer is busy, so these come from your carousel. Edit them freely.');
    } finally {
      setBusy(false);
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setNote('Caption copied.');
      trackEvent('carousel_downloaded', { source: 'caption' });
    } catch {
      setNote('Copy did not work here. Select the caption and copy it by hand.');
    }
  }

  function askToSignIn() {
    writeDraft(draft);
    trackEvent('guest_save_clicked', { source: 'distribute' });
    openLogin({ reason: 'distribute', next: '/distribute' });
  }

  async function savePlan() {
    if (!plan) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/carousel/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, plan, type: draft.type, theme: draft.theme, brand: draft.brand, captions, plannedFor: planned ? new Date(planned).toISOString() : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setNote(data.error || 'Could not save.');
      patch({ id: data.carousel.id });
      setSaved((list) => [data.carousel as Saved, ...list.filter((s) => s.id !== data.carousel.id)]);
      setNote(planned ? `Planned for ${new Date(planned).toLocaleString()}. It is saved to your account.` : 'Saved to your account.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadAll() {
    setBusy(true);
    try {
      const files: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < total; i++) {
        const canvas = document.createElement('canvas');
        renderSlide(canvas, i, draft, pictures);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
        if (blob) files.push({ name: slideFileName(i, total), bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([zipStore(files) as BlobPart], { type: 'application/zip' }));
      link.download = 'carousel.zip';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      trackEvent('carousel_downloaded', { source: 'zip' });
    } finally {
      setBusy(false);
    }
  }

  function openSaved(id: string) {
    const row = saved.find((s) => s.id === id);
    if (!row || !row.plan) return;
    patch({ id: row.id, plan: row.plan, type: row.type, theme: row.theme as Draft['theme'], brand: row.brand, captions: row.captions ?? {}, pictures: {} });
    setPictures((current) => ({ ...current, items: {} }));
    setPlanned(localInput(row.planned_for));
    setIndex(0);
  }

  if (!loaded) return <p className="text-sm text-muted">Loading…</p>;

  if (!plan) {
    return (
      <div className="space-y-5">
        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
          <p className="font-serif text-2xl text-foreground">Nothing to distribute yet</p>
          <p className="mt-2 max-w-sm text-sm text-muted">Make a carousel first. Then come back here to see it as a post on each platform, get captions written, and plan when it goes out.</p>
          <Link href="/create" className={`${btnPrimary} mt-5`}>Make a carousel</Link>
        </div>
        {saved.length > 0 ? (
          <div>
            <p className="text-sm text-foreground">Or open one you saved</p>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-foreground">{s.title}</span>
                  <button type="button" className={btn} onClick={() => openSaved(s.id)}>Open</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  const shown = caption.length > FOLD[platform] ? `${caption.slice(0, FOLD[platform]).trimEnd()}…` : caption;
  const name = draft.brand.name || 'Your brand';
  const handle = draft.brand.handle || '@yourhandle';

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <section aria-label="Preview">
        <div role="tablist" aria-label="Platform" className="flex flex-wrap gap-1 border-b border-line">
          {PLATFORM_IDS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={platform === id} onClick={() => setPlatform(id)} className={`px-3 py-2 text-sm transition ${platform === id ? 'border-b-2 border-ember text-foreground' : 'text-muted hover:text-foreground'}`}>{PLATFORMS[id].label}</button>
          ))}
        </div>

        <figure className="mt-4 overflow-hidden rounded-2xl border border-line bg-panel" aria-label={`How it looks on ${PLATFORMS[platform].label}`}>
          <figcaption className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ember text-xs font-semibold text-background" aria-hidden="true">
              {draft.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a small local data URL
                <img src={draft.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                name.charAt(0).toUpperCase()
              )}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
              <span className="block truncate text-xs text-muted">{handle}</span>
            </span>
          </figcaption>
          <div className="relative bg-black">
            <canvas ref={canvasRef} className="w-full" style={{ aspectRatio: `${W} / ${H}` }} role="img" aria-label={`Slide ${Math.min(index, total - 1) + 1} of ${total}`} />
            <button type="button" aria-label="Previous slide" disabled={index === 0} onClick={() => setIndex(index - 1)} className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-black/60 text-white disabled:opacity-30">‹</button>
            <button type="button" aria-label="Next slide" disabled={index >= total - 1} onClick={() => setIndex(index + 1)} className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-black/60 text-white disabled:opacity-30">›</button>
          </div>
          <div className="flex justify-center gap-1 py-2" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-ember' : 'bg-line'}`} />
            ))}
          </div>
          <p className="whitespace-pre-line px-3 pb-3 text-sm text-foreground">
            <span className="font-semibold">{name}</span> {shown}
            {caption.length > FOLD[platform] ? <span className="text-muted"> more</span> : null}
          </p>
        </figure>
        <p className="mt-2 text-xs text-muted">A simple stand-in for the real app. The first lines of the caption are what people see before they tap more.</p>
      </section>

      <section aria-label="Caption and plan" className="min-w-0 space-y-5">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="caption" className="text-sm font-semibold text-foreground">{PLATFORMS[platform].label} caption</label>
            <span className={`text-xs tabular-nums ${caption.length > limit * 0.95 ? 'text-danger' : 'text-muted'}`}>{caption.length} / {limit}</span>
          </div>
          <textarea id="caption" className={`${field} mt-1.5 min-h-40`} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={limit} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => void writeCaptions()}>{busy ? 'Writing…' : 'Write captions for me'}</button>
            <button type="button" className={btn} onClick={() => void copyCaption()}>Copy caption</button>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-5">
          {signedIn ? (
            <>
              <p className="font-serif text-xl text-foreground">Plan when it goes out</p>
              <label className="mt-3 block text-sm text-foreground">Date and time
                <input type="datetime-local" className={`${field} mt-1.5 max-w-xs`} value={planned} onChange={(e) => setPlanned(e.target.value)} />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={busy} onClick={() => void savePlan()}>{planned ? 'Save the plan' : 'Save to my account'}</button>
                <button type="button" className={btn} disabled={busy || !fontsReady} onClick={() => void downloadAll()}>Download slides (ZIP)</button>
                <Link href="/create" className={btn}>Edit slides</Link>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">For Instagram, TikTok, LinkedIn and X, download the slides, copy the caption and post from the app. Telegram, Discord and Bluesky you can post to below.</p>
            </>
          ) : (
            <>
              <p className="font-serif text-xl text-foreground">Schedule it, or post it</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">Sign in, free, to save this carousel, download the slides, plan when it goes out and come back to it. Your carousel and captions are kept for you.</p>
              <button type="button" className={`${btnPrimary} mt-4`} onClick={askToSignIn}>Sign in to schedule or post</button>
              <p className="mt-2 text-xs text-muted">No card. Sign in with Google or an email link.</p>
            </>
          )}
          {note ? <p role="status" className="mt-3 text-xs text-muted">{note}</p> : null}
        </div>

        {signedIn ? <ChannelPoster draft={draft} pictures={pictures} captions={captions} ready={fontsReady} /> : null}

        {signedIn && saved.length > 0 ? (
          <div>
            <p className="text-sm font-semibold text-foreground">Your saved carousels</p>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{s.title}</span>
                    <span className="block text-xs text-muted">{s.planned_for ? `Planned for ${new Date(s.planned_for).toLocaleString()}` : `Saved ${new Date(s.updated_at).toLocaleDateString()}`}</span>
                  </span>
                  <button type="button" className={btn} onClick={() => openSaved(s.id)}>Open</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
