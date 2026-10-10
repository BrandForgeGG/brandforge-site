'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { zipStore } from '@/lib/zip-store.js';
import { trackEvent } from '@/lib/funnel-client';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { CarouselMaker } from '@/components/carousel/carousel-maker';
import {
  THEME_LIST,
  emptyDraft,
  loadFonts,
  markResume,
  renderSlide,
  slideCount,
  slideFileName,
  writeDraft,
  type Draft,
  type Pictures,
  type Theme,
} from '@/components/carousel/carousel-shared';
import type { CarouselEmbedFields } from '@/lib/creation-embed';

export type CarouselEmbed = { type: 'carousel'; id: string } & CarouselEmbedFields;

function madeAgo(iso: string | null, now: number) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const minutes = Math.round(Math.max(0, now - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function loadCover(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

// A carousel as a message in the thread: it has its own date, stays where it was sent, and everything said
// afterwards carries on underneath it. Change the look, flip through the slides, download, or open the editor.
export function CarouselMessageCard({ embed, createdAt }: { embed: CarouselEmbed; createdAt: string | null }) {
  const { openLogin } = useLogin();
  const [theme, setTheme] = useState<Theme>(embed.theme as Theme);
  const [selected, setSelected] = useState(0);
  const [cover, setCover] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draft = useMemo<Draft>(
    () => ({ ...emptyDraft(), plan: embed.plan, theme, coverStyle: embed.coverStyle, brand: embed.brand, cta: embed.cta, topic: embed.topic, seed: embed.id.slice(0, 6) }),
    [embed, theme],
  );
  const pictures = useMemo<Pictures>(() => ({ items: { [-1]: cover }, logo: null }), [cover]);
  const total = slideCount(draft.plan);

  useEffect(() => {
    let live = true;
    void loadFonts().then(() => live && setFontsReady(true));
    void getSessionUser().then((user) => live && setSignedIn(Boolean(user))).catch(() => live && setSignedIn(false));
    if (embed.coverUrl) void loadCover(embed.coverUrl).then((image) => live && setCover(image));
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [embed.coverUrl]);

  useEffect(() => {
    if (!canvasRef.current || !fontsReady || editing) return;
    renderSlide(canvasRef.current, Math.min(selected, total - 1), draft, pictures);
  }, [draft, pictures, selected, total, fontsReady, editing]);

  function toPng(index: number): Promise<Blob | null> {
    const canvas = document.createElement('canvas');
    renderSlide(canvas, index, draft, pictures);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  function saveFile(blob: Blob, name: string) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  async function downloadAll() {
    if (!signedIn) {
      markResume();
      writeDraft(draft);
      trackEvent('guest_save_clicked', { source: 'carousel_message' });
      openLogin({ reason: 'carousel', next: window.location.pathname + window.location.search });
      return;
    }
    setBusy(true);
    try {
      const files: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < total; i++) {
        const blob = await toPng(i);
        if (blob) files.push({ name: slideFileName(i, total), bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      saveFile(new Blob([zipStore(files) as BlobPart], { type: 'application/zip' }), 'carousel.zip');
      trackEvent('carousel_downloaded', { source: 'message_zip' });
    } finally {
      setBusy(false);
    }
  }

  // The editor opens right here, starting from this carousel (cover picture included).
  async function openEditor() {
    setBusy(true);
    setNote(null);
    try {
      let pictureData: Record<number, string> = {};
      if (embed.coverUrl) {
        const response = await fetch(embed.coverUrl).catch(() => null);
        if (response && response.ok) {
          const blob = await response.blob();
          const data = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
          if (data) pictureData = { [-1]: data };
        }
      }
      writeDraft({ ...draft, pictures: pictureData });
      markResume();
      setEditing(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-5 flex w-full max-w-3xl gap-3">
      <span className="bf-ai-mark flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- bundled local asset at a fixed size */}
        <img src="/discord-server-icon.png" alt="" className="h-full w-full object-cover" />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <p className="mb-3 flex items-baseline gap-2 text-xs text-muted">
          <span className="text-[13px] font-semibold text-foreground">BrandForge AI</span>
          {createdAt ? (
            <time dateTime={createdAt} title={new Date(createdAt).toLocaleString()} className="tabular-nums">
              Made {madeAgo(createdAt, now)}
            </time>
          ) : null}
        </p>

        {editing ? (
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="font-serif text-lg text-foreground">Edit your carousel</p>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-foreground transition hover:border-ember">Done</button>
            </div>
            <CarouselMaker />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,17rem)_1fr]">
            <div>
              <div className="overflow-hidden rounded-xl border border-line bg-background">
                <canvas ref={canvasRef} className="block h-auto w-full" style={{ aspectRatio: '4 / 5' }} aria-label={`Slide ${selected + 1} of ${total}`} />
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
                {THEME_LIST.map((entry: { id: string; label: string; accent: string; bg: string }) => (
                  <button key={entry.id} type="button" onClick={() => setTheme(entry.id as Theme)} aria-pressed={theme === entry.id} aria-label={entry.label} title={entry.label} className={`h-8 w-8 rounded-full border-2 transition ${theme === entry.id ? 'border-ember ring-2 ring-ember/40' : 'border-line hover:border-muted'}`} style={{ background: `linear-gradient(135deg, ${entry.bg} 50%, ${entry.accent} 50%)` }} />
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => void downloadAll()} disabled={busy} className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50">
                  {signedIn === false ? 'Sign in to download' : busy ? 'Preparing…' : 'Download all'}
                </button>
                <button type="button" onClick={() => void openEditor()} disabled={busy} className="rounded-xl border border-line px-4 py-2.5 text-sm text-foreground transition hover:border-ember disabled:opacity-50">
                  Edit words and pictures
                </button>
              </div>
              {note ? <p role="status" className="mt-3 text-xs text-muted">{note}</p> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
