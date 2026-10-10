'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { FORMATS, FORMAT_IDS, KINDS, imageCaption, type ImageFields, type ImageFormat } from '@/lib/image-kinds.js';
import { THEME_LIST, loadFonts, type Theme } from '@/components/carousel/carousel-shared';
import { imageFileName, renderImage, saveBlob } from '@/components/image/image-shared';

export type ImageEmbed = { type: 'image'; id: string } & ImageFields;

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

function loadPicture(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

// An ad, quote, tip, announcement or poll as a message in the thread: it has its own date, stays where it was
// sent, and everything said afterwards carries on underneath. Change the look or the size, copy the caption,
// or download the picture.
export function ImageMessageCard({ embed, createdAt }: { embed: ImageEmbed; createdAt: string | null }) {
  const { openLogin } = useLogin();
  const [theme, setTheme] = useState<Theme>(embed.theme as Theme);
  const [format, setFormat] = useState<ImageFormat>(embed.format);
  const [picture, setPicture] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seed = embed.id.slice(0, 6);
  const spec = useMemo(() => ({ kind: embed.kind, format, copy: embed.copy }), [embed.kind, embed.copy, format]);

  useEffect(() => {
    let live = true;
    void loadFonts().then(() => live && setFontsReady(true));
    void getSessionUser().then((user) => live && setSignedIn(Boolean(user))).catch(() => live && setSignedIn(false));
    if (embed.coverUrl) void loadPicture(embed.coverUrl).then((image) => live && setPicture(image));
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [embed.coverUrl]);

  useEffect(() => {
    if (!canvasRef.current || !fontsReady) return;
    renderImage(canvasRef.current, spec, theme, embed.brand, picture, seed);
  }, [spec, theme, embed.brand, picture, seed, fontsReady]);

  async function download() {
    if (!signedIn) {
      trackEvent('guest_save_clicked', { source: 'image_message' });
      openLogin({ reason: 'carousel', next: window.location.pathname + window.location.search });
      return;
    }
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      renderImage(canvas, spec, theme, embed.brand, picture, seed);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), 'image/png'));
      if (blob) {
        saveBlob(blob, imageFileName(embed.kind, format));
        trackEvent('image_downloaded', { source: embed.kind });
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(imageCaption(embed, embed.brand.handle ? `Try it free at ${embed.brand.handle}` : ''));
      setNote('Caption copied.');
    } catch {
      setNote('Could not copy. Select the words in the picture instead.');
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
        <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="overflow-hidden rounded-xl border border-line bg-background">
            <canvas ref={canvasRef} className="mx-auto block h-auto max-h-[34rem] w-auto max-w-full" aria-label={`${KINDS[embed.kind].label}: ${embed.copy.headline.replace(/\*/g, '')}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{KINDS[embed.kind].label}</p>
            <p className="mt-1 font-serif text-lg leading-snug text-foreground">{embed.copy.headline.replace(/\*/g, '')}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Size</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Size">
              {FORMAT_IDS.map((id: ImageFormat) => (
                <button key={id} type="button" onClick={() => setFormat(id)} aria-pressed={format === id} className={`rounded-full border px-3 py-1.5 text-xs transition ${format === id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                  {FORMATS[id].label} <span className="text-muted">{FORMATS[id].note}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Look</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Look">
              {THEME_LIST.map((entry: { id: string; label: string; accent: string; bg: string }) => (
                <button key={entry.id} type="button" onClick={() => setTheme(entry.id as Theme)} aria-pressed={theme === entry.id} aria-label={entry.label} title={entry.label} className={`h-8 w-8 rounded-full border-2 transition ${theme === entry.id ? 'border-ember ring-2 ring-ember/40' : 'border-line hover:border-muted'}`} style={{ background: `linear-gradient(135deg, ${entry.bg} 50%, ${entry.accent} 50%)` }} />
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => void download()} disabled={busy} className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50">
                {signedIn === false ? 'Sign in to download' : busy ? 'Preparing…' : 'Download picture'}
              </button>
              <button type="button" onClick={() => void copyCaption()} className="rounded-xl border border-line px-4 py-2.5 text-sm text-foreground transition hover:border-ember">
                Copy caption
              </button>
            </div>
            {note ? <p role="status" className="mt-3 text-xs text-muted">{note}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
