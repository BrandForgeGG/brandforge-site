'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { zipStore } from '@/lib/zip-store.js';
import { TYPES } from '@/lib/carousel-plan.js';
import { trackEvent } from '@/lib/funnel-client';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import {
  W,
  H,
  clearDraft,
  downscale,
  emptyDraft,
  loadFonts,
  loadImage,
  picturesFromDraft,
  readDraft,
  renderSlide,
  slideCount,
  slideFileName,
  writeDraft,
  type Draft,
  type Item,
  type Mode,
  type Pictures,
  type Theme,
} from '@/components/carousel/carousel-shared';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50';
const THEME_LABEL: Record<Theme, string> = { forge: 'Forge', crystal: 'Crystal', mono: 'Mono' };
const TYPE_IDS = Object.keys(TYPES) as (keyof typeof TYPES)[];

// Makes numbered-list style carousels (Instagram, TikTok, LinkedIn): a hook cover, one slide per point
// and a closing call to action. Anyone can write one for free and preview every slide. Editing and
// downloading need a free account, and the draft survives the sign-in. Brand name, handle, logo,
// colour and the closing line are the person's own: nothing on a slide is ours unless they put it there.
export function CarouselMaker() {
  const { openLogin } = useLogin();
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [loaded, setLoaded] = useState(false);
  const [pictures, setPictures] = useState<Pictures>({ items: {}, logo: null });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const plan = draft.plan;
  const total = slideCount(plan);
  const patch = useCallback((change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change })), []);

  // Restore what the person was doing (also after the sign-in redirect), and learn if they are signed in.
  useEffect(() => {
    let live = true;
    const saved = readDraft();
    void picturesFromDraft(saved).then((restored) => {
      if (!live) return;
      setDraft(saved);
      setPictures(restored);
      setLoaded(true);
    });
    void loadFonts().then(() => {
      if (live) setFontsReady(true);
    });
    void getSessionUser()
      .then((user) => {
        if (live) setSignedIn(Boolean(user));
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
    if (!canvasRef.current || !plan || !fontsReady || !loaded) return;
    renderSlide(canvasRef.current, Math.min(selected, total - 1), draft, pictures);
  }, [draft, pictures, selected, plan, total, fontsReady, loaded]);

  const canMake = useMemo(() => {
    if (draft.mode === 'words') return draft.topic.trim().length >= 8;
    if (draft.mode === 'url') return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i.test(draft.url.trim());
    return fileText.trim().length >= 200;
  }, [draft.mode, draft.topic, draft.url, fileText]);

  async function makePlan() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/carousel/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: draft.mode, type: draft.type, topic: draft.topic, url: draft.url, text: fileText, name: fileName, count: draft.count, cta: draft.cta }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'That did not work. Try again.');
        return;
      }
      patch({ plan: data.plan, source: data.source ?? null, captions: {}, id: null, pictures: {}, seed: `${draft.mode}:${Date.now() % 9973}` });
      setPictures((current) => ({ ...current, items: {} }));
      setSelected(0);
    } catch {
      setError('Could not reach the writer. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function askToSignIn() {
    writeDraft(draft);
    trackEvent('guest_save_clicked', { source: 'carousel' });
    openLogin({ reason: 'carousel', next: '/create' });
  }

  function patchPlan(change: Partial<NonNullable<Draft['plan']>>) {
    if (plan) patch({ plan: { ...plan, ...change } });
  }

  function patchItem(index: number, change: Partial<Item>) {
    if (plan) patchPlan({ items: plan.items.map((item, i) => (i === index ? { ...item, ...change } : item)) });
  }

  async function onPickImage(index: number, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setNote('Pick a picture file.');
    if (file.size > 12 * 1024 * 1024) return setNote('That picture is over 12 MB. Pick a smaller one.');
    const data = await downscale(file, 1080, 'image/jpeg');
    const img = data ? await loadImage(data) : null;
    if (!data || !img) return setNote('That picture could not be read.');
    setPictures((current) => ({ ...current, items: { ...current.items, [index]: img } }));
    patch({ pictures: { ...draft.pictures, [index]: data } });
  }

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setNote('Pick a picture file.');
    const data = await downscale(file, 420, 'image/png');
    const img = data ? await loadImage(data) : null;
    if (!data || !img) return setNote('That logo could not be read.');
    setPictures((current) => ({ ...current, logo: img }));
    patch({ logo: data });
  }

  async function applyPagePicture(index: number) {
    const image = draft.source?.image;
    if (!image) return;
    const img = await loadImage(`/api/carousel/image?url=${encodeURIComponent(image)}`);
    if (!img) return setNote('That page picture could not be loaded. Upload one instead.');
    setPictures((current) => ({ ...current, items: { ...current.items, [index]: img } }));
  }

  function removePicture(index: number) {
    setPictures((current) => ({ ...current, items: { ...current.items, [index]: null } }));
    const next = { ...draft.pictures };
    delete next[index];
    patch({ pictures: next });
  }

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

  async function downloadOne() {
    const blob = await toPng(selected);
    if (blob) {
      saveFile(blob, slideFileName(selected, total));
      trackEvent('carousel_downloaded', { source: 'single' });
    }
  }

  async function downloadAll() {
    setBusy(true);
    try {
      const files: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < total; i++) {
        const blob = await toPng(i);
        if (blob) files.push({ name: slideFileName(i, total), bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      saveFile(new Blob([zipStore(files) as BlobPart], { type: 'application/zip' }), 'carousel.zip');
      trackEvent('carousel_downloaded', { source: 'zip' });
    } finally {
      setBusy(false);
    }
  }

  async function saveToAccount() {
    if (!plan) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/carousel/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, plan, type: draft.type, theme: draft.theme, brand: draft.brand, captions: draft.captions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setNote(data.error || 'Could not save.');
      patch({ id: data.carousel.id });
      setNote('Saved to your account. Open Distribute to preview it on each platform.');
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

  function startOver() {
    clearDraft();
    setDraft(emptyDraft());
    setPictures({ items: {}, logo: null });
    setFileText('');
    setFileName('');
    setSelected(0);
    setNote(null);
  }

  const tabs: [Mode, string][] = [['words', 'Your words'], ['url', 'A web page'], ['file', 'A text file']];
  const sel = Math.min(selected, Math.max(0, total - 1));
  const isCover = sel === 0;
  const isCta = plan ? sel === total - 1 : false;
  const item = plan && !isCover && !isCta ? plan.items[sel - 1] : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <section aria-label="What the carousel is about" className="space-y-4">
        <div role="tablist" aria-label="Where the words come from" className="flex gap-1 border-b border-line">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={draft.mode === id} onClick={() => patch({ mode: id })} className={`px-3 py-2 text-sm transition ${draft.mode === id ? 'border-b-2 border-ember text-foreground' : 'text-muted hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        <label className="block text-sm text-foreground">What kind of post?
          <select className={`${field} mt-1.5`} value={draft.type} onChange={(e) => patch({ type: e.target.value })}>
            {TYPE_IDS.map((id) => <option key={id} value={id}>{TYPES[id].label}</option>)}
          </select>
        </label>

        {draft.mode === 'words' ? (
          <label className="block text-sm text-foreground">What is it about?
            <textarea className={`${field} mt-1.5 min-h-24`} value={draft.topic} onChange={(e) => patch({ topic: e.target.value })} maxLength={1500} placeholder={draft.type === 'news' ? 'What is happening with electric bikes this month' : 'Seven mistakes first-time founders make with their landing page'} />
            {draft.type === 'news' ? <span className="mt-1 block text-xs text-muted">News and trends searches the web for real sources first, so the facts are not made up.</span> : null}
          </label>
        ) : null}
        {draft.mode === 'url' ? (
          <>
            <label className="block text-sm text-foreground">Page address
              <input className={`${field} mt-1.5`} value={draft.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://yourstore.com/blog/post" inputMode="url" autoCapitalize="none" />
            </label>
            <label className="block text-sm text-foreground">What should it focus on? <span className="text-muted">(optional)</span>
              <input className={`${field} mt-1.5`} value={draft.topic} onChange={(e) => patch({ topic: e.target.value })} maxLength={300} placeholder="The main benefits for first-time buyers" />
            </label>
          </>
        ) : null}
        {draft.mode === 'file' ? (
          <>
            <label className="block text-sm text-foreground">Text file
              <input type="file" accept=".txt,.md,.markdown,.csv,.json,.html,.htm,text/*" className={`${field} mt-1.5`} onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            {fileName ? <p className="text-xs text-muted">{fileName}: {fileText.length.toLocaleString()} characters read</p> : null}
            <label className="block text-sm text-foreground">What should it focus on? <span className="text-muted">(optional)</span>
              <input className={`${field} mt-1.5`} value={draft.topic} onChange={(e) => patch({ topic: e.target.value })} maxLength={300} />
            </label>
          </>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-foreground">Items
            <select className={`${field} mt-1.5`} value={draft.count} onChange={(e) => patch({ count: Number(e.target.value) })}>
              {[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block text-sm text-foreground">Look
            <select className={`${field} mt-1.5`} value={draft.theme} onChange={(e) => patch({ theme: e.target.value as Theme })}>
              {(Object.keys(THEME_LABEL) as Theme[]).map((t) => <option key={t} value={t}>{THEME_LABEL[t]}</option>)}
            </select>
          </label>
        </div>

        <details className="rounded-xl border border-line p-3" open={Boolean(draft.brand.name || draft.brand.handle || draft.cta || draft.logo)}>
          <summary className="cursor-pointer text-sm text-foreground">Your brand and closing line <span className="text-muted">(optional)</span></summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted">Only what you add appears on the slides. Leave it blank for none.</p>
            <label className="block text-sm text-foreground">Brand name
              <input className={`${field} mt-1.5`} value={draft.brand.name} maxLength={28} onChange={(e) => patch({ brand: { ...draft.brand, name: e.target.value } })} placeholder="Your name or business" />
            </label>
            <label className="block text-sm text-foreground">Handle or website
              <input className={`${field} mt-1.5`} value={draft.brand.handle} maxLength={40} onChange={(e) => patch({ brand: { ...draft.brand, handle: e.target.value } })} placeholder="@yourhandle" autoCapitalize="none" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-foreground">Accent colour
                <input type="color" className="ml-2 h-8 w-12 cursor-pointer rounded border border-line bg-background align-middle" value={draft.brand.accent || '#ff6a2b'} onChange={(e) => patch({ brand: { ...draft.brand, accent: e.target.value } })} />
              </label>
              {draft.brand.accent ? <button type="button" className="text-xs text-ember underline-offset-2 hover:underline" onClick={() => patch({ brand: { ...draft.brand, accent: '' } })}>Use the look&apos;s colour</button> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`${btn} cursor-pointer`}>
                {draft.logo ? 'Change logo' : 'Add a logo'}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onPickLogo(e.target.files?.[0])} />
              </label>
              {draft.logo ? <button type="button" className={btn} onClick={() => { setPictures((c) => ({ ...c, logo: null })); patch({ logo: null }); }}>Remove logo</button> : null}
            </div>
            <label className="block text-sm text-foreground">Closing line
              <input className={`${field} mt-1.5`} value={draft.cta} maxLength={80} onChange={(e) => patch({ cta: e.target.value })} placeholder="Follow for more, or Book a call at yoursite.com" />
            </label>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} disabled={busy || !canMake} onClick={() => void makePlan()}>{busy && !plan ? 'Writing…' : plan ? 'Write it again' : 'Make my carousel'}</button>
          {plan ? <button type="button" className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={startOver}>Start over</button> : <span className="text-xs text-muted">Free to make.</span>}
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <p className="text-xs leading-relaxed text-muted">Only facts from what you give it are used, and the numbers are never invented. Slides are drawn in your browser, so nothing is uploaded.</p>
      </section>

      <section aria-label="Your carousel" className="min-w-0">
        {!plan ? (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
            <p className="font-serif text-2xl text-foreground">Your slides show up here</p>
            <p className="mt-2 max-w-sm text-sm text-muted">A hook cover, one slide per point with a big number and three bullets, and a closing call to action. Write it free, then sign in to edit and download.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
            <div>
              <canvas ref={canvasRef} className="w-full rounded-xl border border-line bg-black" style={{ aspectRatio: `${W} / ${H}` }} role="img" aria-label={`Slide ${sel + 1} of ${total}`} />
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Choose a slide">
                {Array.from({ length: total }, (_, i) => (
                  <button key={i} type="button" aria-label={`Slide ${i + 1}`} aria-current={i === sel} onClick={() => setSelected(i)} className={`h-8 min-w-8 rounded-lg border px-2 text-xs transition ${i === sel ? 'border-ember bg-ember/15 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>{i + 1}</button>
                ))}
              </div>
              {signedIn ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} disabled={busy || !fontsReady} onClick={() => void downloadAll()}>Download all (ZIP)</button>
                  <button type="button" className={btn} disabled={busy || !fontsReady} onClick={() => void downloadOne()}>This slide (PNG)</button>
                  <button type="button" className={btn} onClick={() => patch({ seed: `${Date.now()}` })}>New cover art</button>
                  <button type="button" className={btn} disabled={busy} onClick={() => void saveToAccount()}>Save</button>
                  <Link href="/distribute" className={btn}>Preview and distribute</Link>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} onClick={askToSignIn}>Sign in to edit and download</button>
                  <Link href="/distribute" className={btn}>See it on social</Link>
                </div>
              )}
              {note ? <p role="status" className="mt-3 text-xs text-muted">{note}</p> : null}
            </div>

            <div className="space-y-3">
              {!signedIn ? (
                <div className="rounded-2xl border border-line bg-panel p-5">
                  <p className="font-serif text-xl text-foreground">Like it? Make it yours.</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">Sign in, free, to edit every word, add your own pictures and download the slides. Your carousel is saved and waiting for you, and brand, colour and closing line stay yours.</p>
                  <button type="button" className={`${btnPrimary} mt-4`} onClick={askToSignIn}>Sign in and keep going</button>
                  <p className="mt-2 text-xs text-muted">No card. Sign in with Google or an email link.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{isCover ? 'Cover' : isCta ? 'Closing slide' : `Item ${sel}`}</p>
                  {isCover && plan ? (
                    <>
                      <label className="block text-sm text-foreground">Hook
                        <input className={`${field} mt-1.5`} value={plan.cover.headline} maxLength={78} onChange={(e) => patchPlan({ cover: { ...plan.cover, headline: e.target.value } })} />
                        <span className="mt-1 block text-xs text-muted">Put *asterisks* around the words you want highlighted.</span>
                      </label>
                      <label className="block text-sm text-foreground">Line under it
                        <input className={`${field} mt-1.5`} value={plan.cover.subtitle} maxLength={40} onChange={(e) => patchPlan({ cover: { ...plan.cover, subtitle: e.target.value } })} />
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
                          {pictures.items[sel - 1] ? 'Change picture' : 'Add a picture'}
                          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onPickImage(sel - 1, e.target.files?.[0])} />
                        </label>
                        {draft.source?.image ? <button type="button" className={btn} onClick={() => void applyPagePicture(sel - 1)}>Use the page&apos;s picture</button> : null}
                        {pictures.items[sel - 1] ? <button type="button" className={btn} onClick={() => removePicture(sel - 1)}>Remove</button> : null}
                      </div>
                      <p className="text-xs text-muted">The picture sits across the top. A screenshot works best.</p>
                    </>
                  ) : null}
                  {isCta && plan ? (
                    <>
                      <label className="block text-sm text-foreground">Headline
                        <input className={`${field} mt-1.5`} value={plan.cta.headline} maxLength={78} onChange={(e) => patchPlan({ cta: { ...plan.cta, headline: e.target.value } })} />
                      </label>
                      <label className="block text-sm text-foreground">Button
                        <input className={`${field} mt-1.5`} value={plan.cta.button} maxLength={40} onChange={(e) => patchPlan({ cta: { ...plan.cta, button: e.target.value } })} />
                      </label>
                      <label className="block text-sm text-foreground">Small line
                        <input className={`${field} mt-1.5`} value={plan.cta.note} maxLength={60} onChange={(e) => patchPlan({ cta: { ...plan.cta, note: e.target.value } })} />
                      </label>
                    </>
                  ) : null}
                </>
              )}
              {!fontsReady ? <p className="text-xs text-muted">Loading fonts…</p> : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
