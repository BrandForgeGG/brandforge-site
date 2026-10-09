'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { drawCover, drawCta, drawItem, W, H } from '@/lib/carousel-render.js';
import { drawArt } from '@/lib/carousel-art.js';
import { zipStore } from '@/lib/zip-store.js';
import { trackEvent } from '@/lib/funnel-client';

type Theme = 'forge' | 'crystal' | 'mono';
type Mode = 'words' | 'url' | 'file';
type Item = { n: number; name: string; bullets: string[] };
type Plan = { cover: { headline: string; subtitle: string }; items: Item[]; cta: { headline: string; button: string; note: string } };

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50';

const THEME_LABEL: Record<Theme, string> = { forge: 'Forge', crystal: 'Crystal', mono: 'Mono' };

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadFonts(): Promise<void> {
  const faces: [string, string, string][] = [
    ['BFAnton', '/fonts/anton-latin-400-normal.woff2', '400'],
    ['BFInter', '/fonts/inter-latin-600-normal.woff2', '600'],
    ['BFInter', '/fonts/inter-latin-700-normal.woff2', '700'],
  ];
  await Promise.all(
    faces.map(async ([family, url, weight]) => {
      try {
        const face = new FontFace(family, `url(${url})`, { weight });
        await face.load();
        document.fonts.add(face);
      } catch {
        /* the drawing falls back to a system condensed font */
      }
    }),
  );
}

// Makes carousels like the numbered-list posts that do well on Instagram and TikTok: a hook cover,
// one slide per item (a picture on top, a big numbered title and three bullets), a closing call to
// action. The words come from the person's idea, a web page or a text file; the slides are drawn in
// this browser, so nothing is uploaded and the text is always spelled right.
export function CarouselMaker() {
  const [mode, setMode] = useState<Mode>('words');
  const [topic, setTopic] = useState('');
  const [url, setUrl] = useState('');
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [count, setCount] = useState(7);
  const [theme, setTheme] = useState<Theme>('forge');
  const [seed, setSeed] = useState('brandforge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [source, setSource] = useState<{ title: string; image: string | null; url: string | null } | null>(null);
  const [images, setImages] = useState<Record<number, HTMLImageElement | null>>({});
  const [selected, setSelected] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    void loadFonts().then(() => {
      if (live) setFontsReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const slideCount = plan ? plan.items.length + 2 : 0;

  // Draws slide `index` onto any canvas. Cover and closing art are drawn in code from the theme.
  const draw = useCallback(
    (canvas: HTMLCanvasElement, index: number) => {
      if (!plan) return;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const options = { theme, handle: 'brandforge.gg' };
      if (index === 0) {
        drawCover(ctx, { ...plan.cover, kicker: 'Swipe for more', art: drawArt(W, H, { theme, variant: 'cover', seed }) }, options);
      } else if (index === slideCount - 1) {
        drawCta(ctx, { ...plan.cta, art: drawArt(W, H, { theme, variant: 'cta', seed }) }, options);
      } else {
        const item = plan.items[index - 1];
        drawItem(ctx, { ...item, bullets: item.bullets.filter((line) => line.trim()), shot: images[index - 1] ?? null }, options);
      }
    },
    [plan, theme, seed, images, slideCount],
  );

  useEffect(() => {
    if (!canvasRef.current || !plan || !fontsReady) return;
    draw(canvasRef.current, Math.min(selected, slideCount - 1));
  }, [draw, selected, plan, fontsReady, slideCount]);

  async function makePlan() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/carousel/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, topic, url, text: fileText, name: fileName, count }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'That did not work. Try again.');
        return;
      }
      setPlan(data.plan as Plan);
      setSource(data.source ?? null);
      setImages({});
      setSelected(0);
      setSeed(`${mode}:${topic || url || fileName}:${Date.now() % 997}`);
    } catch {
      setError('Could not reach the writer. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function patchItem(index: number, change: Partial<Item>) {
    setPlan((current) => (current ? { ...current, items: current.items.map((item, i) => (i === index ? { ...item, ...change } : item)) } : current));
  }

  async function onPickImage(index: number, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setNote('Pick a picture file.');
    if (file.size > 8 * 1024 * 1024) return setNote('That picture is over 8 MB. Pick a smaller one.');
    const img = await loadImage(URL.createObjectURL(file));
    setImages((current) => ({ ...current, [index]: img }));
  }

  async function applyPagePicture(index: number) {
    if (!source?.image) return;
    const img = await loadImage(`/api/carousel/image?url=${encodeURIComponent(source.image)}`);
    if (!img) return setNote('That page picture could not be loaded. Upload one instead.');
    setImages((current) => ({ ...current, [index]: img }));
  }

  function toPng(index: number): Promise<Blob | null> {
    const canvas = document.createElement('canvas');
    draw(canvas, index);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  function save(blob: Blob, name: string) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  const slideName = (index: number) => `${String(index + 1).padStart(2, '0')}-${index === 0 ? 'cover' : index === slideCount - 1 ? 'end' : `item-${index}`}.png`;

  async function downloadOne() {
    const blob = await toPng(selected);
    if (blob) {
      save(blob, slideName(selected));
      trackEvent('carousel_downloaded', { source: 'single' });
    }
  }

  async function downloadAll() {
    setBusy(true);
    try {
      const files: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < slideCount; i++) {
        const blob = await toPng(i);
        if (blob) files.push({ name: slideName(i), bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      save(new Blob([zipStore(files) as BlobPart], { type: 'application/zip' }), 'carousel.zip');
      trackEvent('carousel_downloaded', { source: 'zip' });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setError('That file is over 2 MB. Use a shorter text file.');
    if (!/\.(txt|md|markdown|csv|json|html?)$/i.test(file.name) && !file.type.startsWith('text/')) {
      return setError('Use a text file (.txt, .md, .csv, .json or .html). For a PDF, paste the text instead.');
    }
    setError(null);
    setFileText((await file.text()).slice(0, 12000));
    setFileName(file.name);
  }

  const canMake = useMemo(() => {
    if (mode === 'words') return topic.trim().length >= 8;
    if (mode === 'url') return /^https?:\/\/\S+$/i.test(url.trim()) || /^[\w-]+(\.[\w-]+)+\S*$/i.test(url.trim());
    return fileText.trim().length >= 200;
  }, [mode, topic, url, fileText]);

  const tabs: [Mode, string][] = [['words', 'Your words'], ['url', 'A web page'], ['file', 'A text file']];
  const sel = Math.min(selected, Math.max(0, slideCount - 1));
  const isCover = sel === 0;
  const isCta = plan ? sel === slideCount - 1 : false;
  const item = plan && !isCover && !isCta ? plan.items[sel - 1] : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <section aria-label="What the carousel is about" className="space-y-4">
        <div role="tablist" aria-label="Where the words come from" className="flex gap-1 border-b border-line">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={`px-3 py-2 text-sm transition ${mode === id ? 'border-b-2 border-ember text-foreground' : 'text-muted hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'words' ? (
          <label className="block text-sm text-foreground">What is it about?
            <textarea className={`${field} mt-1.5 min-h-28`} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={1500} placeholder="Seven mistakes first-time founders make with their landing page" />
          </label>
        ) : null}
        {mode === 'url' ? (
          <>
            <label className="block text-sm text-foreground">Page address
              <input className={`${field} mt-1.5`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourstore.com/blog/post" inputMode="url" autoCapitalize="none" />
            </label>
            <label className="block text-sm text-foreground">What should it focus on? <span className="text-muted">(optional)</span>
              <input className={`${field} mt-1.5`} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} placeholder="The main benefits for first-time buyers" />
            </label>
          </>
        ) : null}
        {mode === 'file' ? (
          <>
            <label className="block text-sm text-foreground">Text file
              <input type="file" accept=".txt,.md,.markdown,.csv,.json,.html,.htm,text/*" className={`${field} mt-1.5`} onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            {fileName ? <p className="text-xs text-muted">{fileName}: {fileText.length.toLocaleString()} characters read</p> : null}
            <label className="block text-sm text-foreground">What should it focus on? <span className="text-muted">(optional)</span>
              <input className={`${field} mt-1.5`} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} />
            </label>
          </>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-foreground">Items
            <select className={`${field} mt-1.5`} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block text-sm text-foreground">Look
            <select className={`${field} mt-1.5`} value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              {(Object.keys(THEME_LABEL) as Theme[]).map((t) => <option key={t} value={t}>{THEME_LABEL[t]}</option>)}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" className={btnPrimary} disabled={busy || !canMake} onClick={() => void makePlan()}>{busy && !plan ? 'Writing…' : plan ? 'Write it again' : 'Make my carousel'}</button>
          <span className="text-xs text-muted">Free. No sign-up.</span>
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <p className="text-xs leading-relaxed text-muted">Only facts from what you give it are used, and the numbers are never invented. Slides are drawn in your browser, so nothing is uploaded.</p>
      </section>

      <section aria-label="Your carousel" className="min-w-0">
        {!plan ? (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
            <p className="font-serif text-2xl text-foreground">Your slides show up here</p>
            <p className="mt-2 max-w-sm text-sm text-muted">A hook cover, one slide per item with a big number and three bullets, and a closing call to action. Edit every word, add your own pictures, then download.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
            <div>
              <canvas ref={canvasRef} className="w-full rounded-xl border border-line bg-black" style={{ aspectRatio: `${W} / ${H}` }} role="img" aria-label={`Slide ${sel + 1} of ${slideCount}`} />
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Choose a slide">
                {Array.from({ length: slideCount }, (_, i) => (
                  <button key={i} type="button" aria-label={`Slide ${i + 1}`} aria-current={i === sel} onClick={() => setSelected(i)} className={`h-8 min-w-8 rounded-lg border px-2 text-xs transition ${i === sel ? 'border-ember bg-ember/15 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>{i + 1}</button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={busy || !fontsReady} onClick={() => void downloadAll()}>Download all (ZIP)</button>
                <button type="button" className={btn} disabled={busy || !fontsReady} onClick={() => void downloadOne()}>This slide (PNG)</button>
                <button type="button" className={btn} onClick={() => setSeed(`${Date.now()}`)}>New cover art</button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{isCover ? 'Cover' : isCta ? 'Closing slide' : `Item ${sel}`}</p>
              {isCover ? (
                <>
                  <label className="block text-sm text-foreground">Hook
                    <input className={`${field} mt-1.5`} value={plan.cover.headline} maxLength={78} onChange={(e) => setPlan({ ...plan, cover: { ...plan.cover, headline: e.target.value } })} />
                    <span className="mt-1 block text-xs text-muted">Put *asterisks* around the words you want highlighted.</span>
                  </label>
                  <label className="block text-sm text-foreground">Line under it
                    <input className={`${field} mt-1.5`} value={plan.cover.subtitle} maxLength={40} onChange={(e) => setPlan({ ...plan, cover: { ...plan.cover, subtitle: e.target.value } })} />
                  </label>
                </>
              ) : null}
              {item ? (
                <>
                  <label className="block text-sm text-foreground">Title
                    <input className={`${field} mt-1.5`} value={item.name} maxLength={28} onChange={(e) => patchItem(sel - 1, { name: e.target.value })} />
                  </label>
                  {[0, 1, 2].map((b) => (
                    <label key={b} className="block text-sm text-foreground">Point {b + 1}
                      <input className={`${field} mt-1.5`} value={item.bullets[b] ?? ''} maxLength={90} onChange={(e) => patchItem(sel - 1, { bullets: [0, 1, 2].map((k) => (k === b ? e.target.value : item.bullets[k] ?? '')) })} />
                    </label>
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`${btn} cursor-pointer`}>
                      {images[sel - 1] ? 'Change picture' : 'Add a picture'}
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onPickImage(sel - 1, e.target.files?.[0])} />
                    </label>
                    {source?.image ? <button type="button" className={btn} onClick={() => void applyPagePicture(sel - 1)}>Use the page&apos;s picture</button> : null}
                    {images[sel - 1] ? <button type="button" className={btn} onClick={() => setImages((c) => ({ ...c, [sel - 1]: null }))}>Remove</button> : null}
                  </div>
                  <p className="text-xs text-muted">The picture sits across the top. A screenshot works best.</p>
                </>
              ) : null}
              {isCta ? (
                <>
                  <label className="block text-sm text-foreground">Headline
                    <input className={`${field} mt-1.5`} value={plan.cta.headline} maxLength={78} onChange={(e) => setPlan({ ...plan, cta: { ...plan.cta, headline: e.target.value } })} />
                  </label>
                  <label className="block text-sm text-foreground">Button
                    <input className={`${field} mt-1.5`} value={plan.cta.button} maxLength={40} onChange={(e) => setPlan({ ...plan, cta: { ...plan.cta, button: e.target.value } })} />
                  </label>
                  <label className="block text-sm text-foreground">Small line
                    <input className={`${field} mt-1.5`} value={plan.cta.note} maxLength={60} onChange={(e) => setPlan({ ...plan, cta: { ...plan.cta, note: e.target.value } })} />
                  </label>
                </>
              ) : null}
              {note ? <p role="status" className="text-xs text-muted">{note}</p> : null}
              {!fontsReady ? <p className="text-xs text-muted">Loading fonts…</p> : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
