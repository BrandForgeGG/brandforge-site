'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { zipStore } from '@/lib/zip-store.js';
import { clearAccountLocalState } from '@/lib/account-local';
import { supabase } from '@/lib/supabase';
import { PostVisual } from '@/components/distribute/post-visual';
import { postFiles } from '@/components/distribute/render-post';
import { NetworkVersions } from '@/components/distribute/network-versions';
import { usePublisher, type ScheduledItem } from '@/components/distribute/use-publisher';
import { ServiceTile } from '@/components/integrations/brand-icons';
import { ShareButton } from '@/components/community/share-button';
import { PublishedFeed } from '@/components/distribute/published-feed';
import { assembleWeek, layoutWeek, NO_SITE_ASKS, type PlannedDay, type PlannedPost } from '@/lib/distribute-plan.js';

type Brief = { start: string; perDay: number; summary: string; voice: string; angles: string[]; site: string; brand: string; seed: string; source: 'text' | 'link' | 'file' };
type Plan = { start: string; perDay: number; summary: string; voice: string; site: string; source: 'text' | 'link' | 'file'; days: PlannedDay[]; plainDays: number };
type Saved = { v: 1; text: string; perDay: number; start: string; fileName: string; fileText: string; brand?: string; plan: Plan | null };

const KEY = 'bf:distribute';
const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const FORMAT_LABEL: Record<string, string> = { carousel: 'Carousel', quote: 'Quote', tip: 'Tip', ad: 'Ad', announcement: 'Announcement', question: 'Poll' };
const PHASES = ['Reading what you gave me', 'Deciding what to say this week', 'Writing each day and its pictures'];

// "07:00" -> "7:00 AM", "17:00" -> "5:00 PM".
function clock(time: string): string {
  const hour = Number(time.slice(0, 2));
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${time.slice(3, 5)} ${suffix}`;
}

function localTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const STATUS_TEXT: Record<ScheduledItem['status'], string> = { scheduled: 'Scheduled', posting: 'Posting now', done: 'Posted', partial: 'Posted to some', failed: 'Could not post', cancelled: 'Cancelled' };

function statusOf(items: ScheduledItem[], postId: string): ScheduledItem | undefined {
  return [...items].reverse().find((item) => item.label === postId && item.status !== 'cancelled');
}

function makeLink(post: PlannedPost): string {
  const make = post.format === 'carousel' ? 'carousel' : `image-${post.format}`;
  return `/create?make=${make}&topic=${encodeURIComponent(post.topic)}`;
}

function read(): Saved | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Saved) : null;
    return parsed && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function write(value: Saved) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage blocked or full: the plan still shows, it just will not come back */
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\r?\n/g, '\n')}"`;
}

// Distribute: say what you promote (a sentence, a link or a file) and the AI writes a week of posts: what to make,
// when to post it, and a caption that asks for something different each time. Each post has a button that opens the
// maker with its topic filled in, so a week is a few taps from done.
export function DistributeHub() {
  const [text, setText] = useState('');
  const [perDay, setPerDay] = useState(3);
  const [start, setStart] = useState(localTomorrow);
  const [fileName, setFileName] = useState('');
  const [fileText, setFileText] = useState('');
  const [brand, setBrand] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const { openLogin } = useLogin();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // The post open in the detail panel under the calendar, and whether the brief is being changed.
  const [selected, setSelected] = useState<{ d: number; p: number }>({ d: 0, p: 0 });
  const [editing, setEditing] = useState(false);
  // With no week written yet the maker stays folded: the page opens on what members are publishing.
  const [makerOpen, setMakerOpen] = useState(false);
  // A week saved in this browser comes back folded, so a refresh opens on the page, not on the calendar. It opens on its own
  // only right after being written.
  const [weekOpen, setWeekOpen] = useState(false);
  // While the days are being written the calendar is already on screen: days not yet in are shown as placeholders.
  const [writing, setWriting] = useState(false);
  const [loadingDays, setLoadingDays] = useState<number[]>([]);
  const stop = useRef<AbortController | null>(null);
  const publisher = usePublisher(signedIn);

  useEffect(() => {
    const saved = read();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved week is only readable in the browser
      setText(saved.text);
      setPerDay(saved.perDay);
      setStart(saved.start || localTomorrow());
      setFileName(saved.fileName);
      setFileText(saved.fileText);
      setBrand(saved.brand ?? '');
      setPlan(saved.plan);
    }
    void getSessionUser().then((user) => setSignedIn(Boolean(user))).catch(() => setSignedIn(false));
    setReady(true);
    // Signing out in another tab (or this one) clears the saved week here too, so it never stays on screen for the next person.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      clearAccountLocalState();
      setSignedIn(false);
      setPlan(null);
      setText('');
      setFileName('');
      setFileText('');
      setBrand('');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready || writing) return;
    write({ v: 1, text, perDay, start, fileName, fileText: fileText.slice(0, 6000), brand, plan });
  }, [ready, writing, text, perDay, start, fileName, fileText, brand, plan]);

  // Leaving the page stops any writing still on its way, instead of letting it run on unseen.
  useEffect(() => {
    return () => stop.current?.abort();
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setPhase((current) => Math.min(current + 1, PHASES.length - 1)), 4500);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 400_000 || !/(\.txt|\.md|\.markdown|\.csv|\.json|\.html?)$/i.test(file.name)) {
      setError('Attach a text file (.txt, .md, .csv or .json) under 400 KB, or paste the words into the box.');
      return;
    }
    setError(null);
    setFileName(file.name);
    setFileText(await file.text());
  }

  // A fetch that gives up after `ms` (or when the person presses Stop) instead of leaving the page waiting.
  async function post<T>(url: string, body: unknown, ms: number, signal: AbortSignal): Promise<{ ok: boolean; status: number; data: T }> {
    const timer = new AbortController();
    const clock_ = window.setTimeout(() => timer.abort(), ms);
    const onStop = () => timer.abort();
    signal.addEventListener('abort', onStop);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: timer.signal });
      const data = (await res.json().catch(() => ({}))) as T;
      return { ok: res.ok, status: res.status, data };
    } finally {
      window.clearTimeout(clock_);
      signal.removeEventListener('abort', onStop);
    }
  }

  // The week with nothing written yet, and a plain day built from the brief alone (used when a day cannot be written).
  function skeleton(brief: Brief): PlannedDay[] {
    const week = layoutWeek({ startDate: brief.start, perDay: brief.perDay, seed: brief.seed, allow: brief.site ? undefined : NO_SITE_ASKS });
    return week.map((day) => ({ date: day.date, name: day.name, focus: day.focus, posts: day.posts.map((post, i) => ({ id: `${day.date}-${i}`, time: post.time, format: post.format, cta: post.cta, angle: '', topic: '', caption: '' })) }));
  }

  function plainDay(brief: Brief, d: number): PlannedDay {
    const week = layoutWeek({ startDate: brief.start, perDay: brief.perDay, seed: brief.seed, allow: brief.site ? undefined : NO_SITE_ASKS });
    return assembleWeek({ week, angles: brief.angles, written: week.map(() => null), site: brief.site, brand: brief.brand, seed: brief.seed })[d];
  }

  async function write_(startDate: string) {
    if (busy || writing) return;
    if (text.trim().length < 10 && !fileText) {
      setError('Say what you want to promote, paste a link, or attach a file.');
      return;
    }
    setError(null);
    setNote(null);
    setPhase(0);
    setBusy(true);
    const controller = new AbortController();
    stop.current = controller;
    trackEvent('distribute_started', { source: fileText ? 'file' : /https?:\/\/|\.[a-z]{2,}/i.test(text) ? 'link' : 'text' });

    // Step 1: read what they gave and decide what to say all week.
    let brief: Brief | null = null;
    try {
      // A busy writer (502) is retried once, quietly, before the person sees an error.
      for (let attempt = 0; attempt < 2 && !brief; attempt++) {
        const res = await post<{ brief?: Brief; error?: string }>('/api/distribute/brief', { text, fileText, fileName, perDay, startDate, brand }, 50_000, controller.signal);
        if (res.ok && res.data.brief) {
          brief = res.data.brief;
        } else if (res.status === 502 && attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 4000));
          if (controller.signal.aborted) throw new Error('stopped');
        } else {
          setError(res.data.error || 'That did not work. Try again.');
          setBusy(false);
          return;
        }
      }
      if (!brief) {
        setError('The writer is busy. Try again in a moment.');
        setBusy(false);
        return;
      }
    } catch {
      setError(controller.signal.aborted ? 'Stopped.' : 'The writer took too long. Check your connection and try again.');
      setBusy(false);
      return;
    }

    // The calendar appears now, and the days fill in as they are written.
    const days = skeleton(brief);
    setPlan({ start: brief.start, perDay: brief.perDay, summary: brief.summary, voice: brief.voice, site: brief.site, source: brief.source, days, plainDays: 0 });
    setStart(startDate);
    setSelected({ d: 0, p: 0 });
    setEditing(false);
    setLoadingDays(days.map((_, d) => d));
    setWriting(true);
    setWeekOpen(true);
    setBusy(false);

    // Step 2: one request per day, all at once (seven writers finish in about the time of one). A failed or unfinished day gets one more try, then a plain day.
    const queue = days.map((_, d) => d);
    const done = new Set<number>();
    const settle = (d: number, day: PlannedDay) => {
      done.add(d);
      setPlan((current) => (current ? { ...current, days: current.days.map((entry, i) => (i === d ? day : entry)) } : current));
      setLoadingDays((current) => current.filter((i) => i !== d));
    };
    const worker = async () => {
      for (let d = queue.shift(); d !== undefined; d = queue.shift()) {
        if (controller.signal.aborted) return;
        let made: PlannedDay | null = null;
        for (let attempt = 0; attempt < 2 && !made; attempt++) {
          try {
            const res = await post<{ day?: PlannedDay }>('/api/distribute/day', { brief, dayIndex: d }, 48_000, controller.signal);
            if (res.ok && res.data.day) {
              const unfinished = res.data.day.posts.every((entry) => entry.fallback);
              if (!unfinished || attempt === 1) made = res.data.day;
            }
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        settle(d, made ?? plainDay(brief as Brief, d));
      }
    };
    await Promise.all(days.map(() => worker()));

    // Stopped early (or a day never came back): those days become plain days, so the week is never left with holes.
    for (let d = 0; d < days.length; d++) if (!done.has(d)) settle(d, plainDay(brief as Brief, d));
    setPlan((current) => (current ? { ...current, plainDays: current.days.filter((day) => day.posts.some((entry) => entry.fallback)).length } : current));
    setWriting(false);
    stop.current = null;
  }

  function stopWriting() {
    stop.current?.abort();
  }

  function editCaption(dayIndex: number, postIndex: number, caption: string) {
    setPlan((current) => (current ? { ...current, days: current.days.map((day, d) => (d === dayIndex ? { ...day, posts: day.posts.map((post, p) => (p === postIndex ? { ...post, caption } : post)) } : day)) } : current));
  }

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNote(message);
    } catch {
      setNote('Could not copy. Select the text and copy it.');
    }
  }

  function weekText(): string {
    if (!plan) return '';
    return plan.days
      .map((day) => `${prettyDate(day.date)} (${day.focus})\n` + day.posts.map((post) => `${clock(post.time)}  ${FORMAT_LABEL[post.format] ?? post.format}\n${post.caption}`).join('\n\n'))
      .join('\n\n------\n\n');
  }

  function csvText(week: Plan): string {
    const rows = [['Date', 'Time', 'Format', 'What to make', 'Caption'].map(csvCell).join(',')];
    for (const day of week.days) for (const post of day.posts) rows.push([day.date, post.time, FORMAT_LABEL[post.format] ?? post.format, post.topic, post.caption].map(csvCell).join(','));
    return rows.join('\n');
  }

  function downloadCsv() {
    if (!plan) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csvText(plan)], { type: 'text/csv' }));
    link.download = `brandforge-week-${plan.start}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    trackEvent('distribute_downloaded', { source: 'csv' });
  }

  // The pictures people download are the ones on the page. Guests sign in first; the week stays in this browser.
  function needSignIn(): boolean {
    if (signedIn) return false;
    trackEvent('guest_save_clicked', { source: 'distribute' });
    openLogin({ reason: 'carousel', next: '/distribute' });
    return true;
  }

  function saveBlob(blob: Blob, name: string) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  async function downloadPost(day: PlannedDay, post: PlannedPost) {
    if (needSignIn() || preparing) return;
    setPreparing(post.id);
    try {
      const files = await postFiles(post, { name: brand.trim(), handle: plan?.site ?? '' }, day.date);
      if (files.length === 1) saveBlob(files[0].blob, files[0].name);
      else if (files.length > 1) {
        const entries = await Promise.all(files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.blob.arrayBuffer()) })));
        saveBlob(new Blob([zipStore(entries) as BlobPart], { type: 'application/zip' }), `${day.date}-${post.time.replace(':', '')}-carousel.zip`);
      }
      trackEvent('distribute_downloaded', { source: 'post' });
    } finally {
      setPreparing(null);
    }
  }

  async function downloadAll() {
    if (!plan || needSignIn() || preparing) return;
    const posts = plan.days.flatMap((day) => day.posts.map((post) => ({ day, post })));
    const entries: { name: string; bytes: Uint8Array }[] = [];
    try {
      for (let i = 0; i < posts.length; i++) {
        setPreparing(`Preparing ${i + 1} of ${posts.length}…`);
        for (const file of await postFiles(posts[i].post, { name: brand.trim(), handle: plan.site }, posts[i].day.date)) entries.push({ name: file.name, bytes: new Uint8Array(await file.blob.arrayBuffer()) });
      }
      entries.push({ name: 'captions.csv', bytes: new TextEncoder().encode(csvText(plan)) });
      saveBlob(new Blob([zipStore(entries) as BlobPart], { type: 'application/zip' }), `brandforge-week-${plan.start}.zip`);
      trackEvent('distribute_downloaded', { source: 'zip' });
    } finally {
      setPreparing(null);
    }
  }

  function startOver() {
    setEditing(false);
    setWeekOpen(false);
    setPlan(null);
    setNote(null);
    setError(null);
  }

  if (!ready) {
    return (
      <div className="max-w-5xl" aria-hidden="true">
        <div className="bf-skeleton h-44 rounded-2xl bg-overlay" />
      </div>
    );
  }

  if (busy) {
    return (
      <div role="status" className="mx-auto max-w-xl py-14 text-center">
        <div className="flex items-end justify-center gap-3" aria-hidden="true">
          {[-6, 0, 6].map((tilt, i) => (
            <div key={i} className="bf-float relative aspect-[4/5] w-16 overflow-hidden rounded-lg border border-line bg-panel shadow-lg sm:w-20" style={{ transform: `rotate(${tilt}deg)`, animationDelay: `${i * 0.35}s` }}>
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-ember/25 to-transparent" style={{ animationDelay: `${i * 0.3}s` }} />
              <div className="absolute inset-x-2 bottom-3 space-y-1">
                <div className="h-1.5 w-5/6 rounded-sm bg-foreground/50" />
                <div className="h-1.5 w-3/5 rounded-sm bg-ember" />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 font-serif text-xl text-foreground">{PHASES[phase]}…</p>
        <p className="mt-1 text-sm text-foreground/70">Reading what you gave me takes a few seconds. Then the week fills in day by day.</p>
        <button type="button" onClick={stopWriting} className="mt-4 text-xs text-foreground/70 underline-offset-2 hover:text-foreground hover:underline">Stop</button>
        <ol className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
          {PHASES.map((label, i) => (
            <li key={label} className={`h-1 w-10 rounded-full transition-colors duration-500 ${i <= phase ? 'bg-ember' : 'bg-line'}`} />
          ))}
        </ol>
      </div>
    );
  }

  const showMaker = editing || (!plan && makerOpen);
  const pickedDay = plan?.days[Math.min(selected.d, (plan?.days.length ?? 1) - 1)];
  const pickedPost = pickedDay?.posts[Math.min(selected.p, (pickedDay?.posts.length ?? 1) - 1)];
  const pickedBrand = { name: brand.trim(), handle: plan?.site ?? '' };

  return (
    <div className="max-w-5xl">
      {/* The maker: the same calm size as Trade's. With a week written it folds into one line. */}
      {showMaker ? (
        <section aria-label="Write a week" className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <label htmlFor="distribute-brief" className="font-serif text-lg text-foreground">What do you want to promote?</label>
          <textarea
            id="distribute-brief"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            maxLength={2500}
            placeholder="Describe it, or paste a link. The AI writes your week."
            className={`${field} mt-2 text-base`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" accept=".txt,.md,.markdown,.csv,.json,.html,.htm,text/plain" className="hidden" onChange={(event) => void pickFile(event.target.files?.[0])} />
            <button type="button" onClick={() => fileInput.current?.click()} className="rounded-full border border-line px-3 py-1 text-xs text-foreground/70 bf-tap transition hover:border-ember hover:text-foreground">Attach a file</button>
            {fileName ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-overlay px-3 py-1 text-xs text-foreground">
                {fileName}
                <button type="button" aria-label="Remove the file" onClick={() => { setFileName(''); setFileText(''); }} className="text-foreground/70 hover:text-foreground">✕</button>
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-1.5 text-xs text-foreground/70" role="group" aria-label="Posts a day">
              Posts a day
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setPerDay(n)} aria-pressed={perDay === n} className={`h-7 w-7 rounded-full border text-xs transition ${perDay === n ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-foreground/70 hover:text-foreground'}`}>{n}</button>
              ))}
            </span>
          </div>
          {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void write_(start)} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90">Write my week</button>
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} aria-label="First day" className="rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-ember focus:outline-none" />
            <input value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={40} placeholder="Name on the pictures (optional)" aria-label="Name on the pictures" className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none sm:max-w-[16rem]" />
            {editing || !plan ? <button type="button" onClick={() => { setEditing(false); setMakerOpen(false); }} className="px-2 py-2 text-sm text-foreground/70 transition hover:text-foreground">{plan ? 'Cancel' : 'Close'}</button> : null}
          </div>
        </section>
      ) : !plan ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <div className="min-w-0">
            <p className="font-serif text-lg text-foreground">Write a week of posts</p>
            <p className="text-sm text-foreground/70">Say what you promote. Get pictures, captions and times, then post or schedule them.</p>
            <p className="mt-1 text-xs text-foreground/70">Rather have it posted for you every month? <a href="/pricing" className="font-semibold text-foreground underline-offset-2 hover:underline">See team plans</a></p>
          </div>
          <button type="button" aria-expanded={makerOpen} onClick={() => setMakerOpen(true)} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90">Start a week</button>
        </div>
      ) : (
        <div className={weekOpen ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel p-4 sm:p-5'}>
          <div className="min-w-0 flex-1 basis-60">
            {weekOpen ? null : <p className="font-serif text-lg text-foreground">Your week{plan ? `, from ${prettyDate(plan.days[0].date)}` : ''}</p>}
            <p className="text-sm leading-relaxed text-foreground/70">
              <span className={weekOpen ? 'text-foreground' : ''}>{plan?.summary}</span>
              {plan?.site ? ` Posts send people to ${plan.site}.` : ''}
            </p>
          </div>
          {weekOpen ? (
            <>
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-line px-3 py-1.5 text-xs bf-tap text-foreground transition hover:border-ember">Change what I promote</button>
              <button type="button" onClick={() => setWeekOpen(false)} className="px-2 py-1.5 text-xs text-foreground/70 transition hover:text-foreground">Close</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setWeekOpen(true)} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90">Open your week</button>
              <button type="button" onClick={() => setEditing(true)} className="rounded-xl border border-line px-4 py-2.5 text-sm text-foreground transition hover:border-ember">Start a new week</button>
            </>
          )}
        </div>
      )}

      {plan && !editing && weekOpen ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void downloadAll()} disabled={Boolean(preparing) || writing} className="rounded-xl bg-ember px-4 py-2 text-sm bf-tap font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60">{preparing && preparing.startsWith('Preparing') ? preparing : signedIn === false ? 'Sign in to download all' : 'Download all pictures'}</button>
            <button type="button" onClick={() => void copy(weekText(), 'The whole week is copied.')} className="rounded-xl border border-line px-4 py-2 text-sm bf-tap text-foreground transition hover:border-ember">Copy the captions</button>
            <button type="button" onClick={downloadCsv} className="rounded-xl border border-line px-4 py-2 text-sm bf-tap text-foreground transition hover:border-ember">Captions CSV</button>
            <button type="button" onClick={() => void write_(shift(plan.start, 7))} disabled={writing} className="rounded-xl border border-line px-4 py-2 text-sm bf-tap text-foreground transition hover:border-ember disabled:opacity-50">Write next week</button>
            <button type="button" onClick={startOver} className="px-2 py-2 text-sm text-foreground/70 transition hover:text-foreground">Start over</button>
          </div>
          {/* Where the posts go. Channels are linked in Settings; the choice is remembered in this browser. */}
          <section aria-label="Where to post" className="mt-3 rounded-2xl border border-line bg-panel p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-1 text-sm font-semibold text-foreground">Post to</p>
              {signedIn === false ? (
                <button type="button" onClick={() => needSignIn()} className="rounded-full border border-line px-3 py-1 text-xs text-foreground/70 bf-tap transition hover:border-ember hover:text-foreground">Sign in to post and schedule</button>
              ) : publisher.channels.length === 0 ? (
                <span className="text-xs text-foreground/70">{publisher.loading ? 'Loading your channels…' : 'No channel linked yet.'}</span>
              ) : (
                publisher.channels.map((channel) => {
                  const on = publisher.picked.includes(channel.id);
                  return (
                    <button key={channel.id} type="button" aria-pressed={on} onClick={() => publisher.toggle(channel.id)} className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs bf-tap transition ${on ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-foreground/70 hover:text-foreground'}`}>
                      <ServiceTile id={channel.kind} on={on} size={24} />
                      <span className="max-w-[10rem] truncate">{channel.label}</span>
                    </button>
                  );
                })
              )}
              {signedIn ? <Link href="/settings#integrations" className="text-xs text-foreground/70 underline-offset-2 hover:text-foreground hover:underline">{publisher.channels.length === 0 ? 'Connect channels' : 'Add'}</Link> : null}
              {signedIn && publisher.channels.length > 0 ? (
                <button type="button" onClick={() => void publisher.scheduleWeek(plan.days, pickedBrand)} disabled={Boolean(publisher.busy) || writing || publisher.picked.length === 0 || !publisher.ready} className="ml-auto rounded-xl bg-ember px-4 py-2 text-sm bf-tap font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60">
                  {publisher.busy && publisher.busy.startsWith('Scheduling') ? publisher.busy : 'Schedule the whole week'}
                </button>
              ) : null}
            </div>
            {!publisher.ready ? <p className="mt-2 text-xs text-foreground/70">Scheduling is being switched on. Download or post now in the meantime.</p> : null}
            {publisher.message ? <p role={publisher.message.bad ? 'alert' : 'status'} className={`mt-2 text-xs ${publisher.message.bad ? 'text-danger' : 'text-foreground/70'}`}>{publisher.message.text}</p> : null}
          </section>
          {writing ? (
            <div role="status" className="mt-3 flex items-center gap-3 text-xs text-foreground/70">
              <span className="h-1 w-32 overflow-hidden rounded-full bg-line" aria-hidden="true"><span className="block h-full rounded-full bg-ember transition-all duration-500" style={{ width: `${Math.round(((7 - loadingDays.length) / 7) * 100)}%` }} /></span>
              Writing day {Math.min(7, 8 - loadingDays.length)} of 7. You can already open the days that are done.
              <button type="button" onClick={stopWriting} className="underline-offset-2 hover:text-foreground hover:underline">Stop</button>
            </div>
          ) : null}
          {note ? <p role="status" className="mt-2 text-xs text-foreground/70">{note}</p> : null}
          {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
          {plan.plainDays > 0 ? <p className="mt-2 text-xs text-foreground/70">{plan.plainDays === 1 ? 'One day uses' : `${plan.plainDays} days use`} simpler captions because the writer was busy. Write the week again to improve {plan.plainDays === 1 ? 'it' : 'them'}.</p> : null}

          {/* The calendar: seven days across, each post a small picture at its time. Pick one to open it below. */}
          <section aria-label="Week calendar" className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
              {prettyDate(plan.days[0].date)} to {prettyDate(plan.days[plan.days.length - 1].date)}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-7">
              {plan.days.map((day, d) => (
                <div key={day.date} className="min-w-0 rounded-xl border border-line bg-panel/50 p-2">
                  <p className="text-[11px] font-semibold text-foreground">{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })} <span className="font-normal text-foreground/70">{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></p>
                  <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-1">
                    {day.posts.map((post, p) => {
                      const on = selected.d === d && selected.p === p;
                      return (
                        <li key={post.id}>
                          <button
                            type="button"
                            onClick={() => setSelected({ d, p })}
                            aria-pressed={on}
                            aria-label={`${prettyDate(day.date)}, ${clock(post.time)}, ${FORMAT_LABEL[post.format] ?? post.format}`}
                            className={`block w-full rounded-lg border p-1 text-left transition ${on ? 'border-ember ring-1 ring-ember/50' : 'border-line hover:border-muted'}`}
                          >
                            {loadingDays.includes(d) ? <div className="bf-skeleton aspect-square w-full animate-pulse rounded-lg bg-overlay motion-reduce:animate-none" aria-hidden="true" /> : <div className="bf-fade"><PostVisual post={post} brand={pickedBrand} size="tile" /></div>}
                            <span className="mt-1 flex items-center justify-between gap-1 px-0.5 text-[10px]">
                              <span className="shrink-0 whitespace-nowrap tabular-nums text-foreground">
                                {(() => {
                                  const item = statusOf(publisher.items, post.id);
                                  return item ? <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${item.status === 'done' ? 'bg-success' : item.status === 'failed' ? 'bg-danger' : 'bg-ember'}`} title={STATUS_TEXT[item.status]} aria-label={STATUS_TEXT[item.status]} /> : null;
                                })()}
                                {clock(post.time)}
                              </span>
                              <span className="truncate uppercase tracking-wide text-foreground/70">{FORMAT_LABEL[post.format] ?? post.format}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {pickedDay && pickedPost && !loadingDays.includes(Math.min(selected.d, (plan?.days.length ?? 1) - 1)) ? (
            <section aria-label="Selected post" className="mt-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="w-full sm:w-64 sm:shrink-0">
                  <PostVisual key={pickedPost.id} post={pickedPost} brand={pickedBrand} size="full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground">{prettyDate(pickedDay.date)}, {clock(pickedPost.time)}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/70">{FORMAT_LABEL[pickedPost.format] ?? pickedPost.format}</span>
                    <span className="text-foreground/70">{pickedDay.focus}</span>
                    {(() => {
                      const item = statusOf(publisher.items, pickedPost.id);
                      if (!item) return null;
                      const bad = item.status === 'failed' || item.status === 'partial';
                      const note = Object.values(item.results).find((r) => !r.ok)?.note;
                      return <span className={bad ? 'text-danger' : 'text-ember'}>{STATUS_TEXT[item.status]}{bad && note ? `: ${note}` : ''}</span>;
                    })()}
                  </p>
                  <p className="mt-1 text-sm text-foreground">{pickedPost.topic}</p>
                  <textarea
                    value={pickedPost.caption}
                    onChange={(event) => editCaption(Math.min(selected.d, plan.days.length - 1), Math.min(selected.p, pickedDay.posts.length - 1), event.target.value)}
                    rows={Math.min(9, Math.max(4, Math.ceil(pickedPost.caption.length / 60) + pickedPost.caption.split('\n').length - 1))}
                    aria-label={`Caption for ${prettyDate(pickedDay.date)} at ${clock(pickedPost.time)}`}
                    className={`${field} mt-2 text-[13px] leading-relaxed`}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void downloadPost(pickedDay, pickedPost)} disabled={Boolean(preparing)} className="rounded-lg bg-ember px-3 py-1.5 text-xs bf-tap font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60">
                      {preparing === pickedPost.id ? 'Preparing…' : signedIn === false ? 'Sign in to download' : pickedPost.format === 'carousel' ? 'Download slides' : 'Download picture'}
                    </button>
                    <button type="button" onClick={() => void copy(pickedPost.caption, 'Caption copied.')} className="rounded-lg border border-line px-3 py-1.5 text-xs bf-tap text-foreground transition hover:border-ember">Copy caption</button>
                    {signedIn && publisher.channels.length > 0 ? (
                      <>
                        {(() => {
                          const item = statusOf(publisher.items, pickedPost.id);
                          const waiting = item && (item.status === 'scheduled' || item.status === 'posting');
                          return waiting ? (
                            <button type="button" onClick={() => void publisher.cancel(item.id)} disabled={item.status === 'posting'} className="rounded-lg border border-line px-3 py-1.5 text-xs bf-tap text-foreground transition hover:border-danger disabled:opacity-50">Cancel schedule</button>
                          ) : (
                            <button type="button" onClick={() => void publisher.scheduleOne(pickedDay, pickedPost, pickedBrand)} disabled={Boolean(publisher.busy) || publisher.picked.length === 0 || !publisher.ready} className="rounded-lg border border-ember px-3 py-1.5 text-xs bf-tap font-semibold text-foreground transition hover:bg-ember/10 disabled:opacity-50">
                              {publisher.busy === pickedPost.id ? 'Working…' : `Schedule for ${clock(pickedPost.time)}`}
                            </button>
                          );
                        })()}
                        <button type="button" onClick={() => void publisher.postNow(pickedDay, pickedPost, pickedBrand)} disabled={Boolean(publisher.busy) || publisher.picked.length === 0} className="rounded-lg border border-line px-3 py-1.5 text-xs bf-tap text-foreground transition hover:border-ember disabled:opacity-50">Post now</button>
                      </>
                    ) : null}
                    <ShareButton kind="distribute" format={pickedPost.format} title={pickedPost.topic} caption={pickedPost.caption} getImages={async () => (await postFiles(pickedPost, pickedBrand, pickedDay.date)).map((file) => file.blob)} />
                    <Link href={makeLink(pickedPost)} onClick={() => trackEvent('next_step_clicked', { source: 'distribute_make' })} className="px-2 py-1.5 text-xs text-foreground/70 bf-tap transition hover:text-foreground">Edit in the maker</Link>
                  </div>
                  <NetworkVersions post={pickedPost} brand={pickedBrand} channels={publisher.channels} picked={publisher.picked} />
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      <PublishedFeed />
    </div>
  );
}
