'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import type { PlannedDay, PlannedPost } from '@/lib/distribute-plan.js';

type Plan = { start: string; perDay: number; summary: string; voice: string; site: string; source: 'text' | 'link' | 'file'; days: PlannedDay[]; plainDays: number };
type Saved = { v: 1; text: string; perDay: number; start: string; fileName: string; fileText: string; plan: Plan | null };

const KEY = 'bf:distribute';
const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const chip = 'rounded-full border px-3 py-1.5 text-xs transition';
const FORMAT_LABEL: Record<string, string> = { carousel: 'Carousel', quote: 'Quote', tip: 'Tip', ad: 'Ad', announcement: 'Announcement', question: 'Poll' };
const PHASES = ['Reading what you gave me', 'Deciding what to say this week', 'Writing each day'];

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
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = read();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved week is only readable in the browser
      setText(saved.text);
      setPerDay(saved.perDay);
      setStart(saved.start || localTomorrow());
      setFileName(saved.fileName);
      setFileText(saved.fileText);
      setPlan(saved.plan);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    write({ v: 1, text, perDay, start, fileName, fileText: fileText.slice(0, 6000), plan });
  }, [ready, text, perDay, start, fileName, fileText, plan]);

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

  async function write_(startDate: string) {
    if (busy) return;
    if (text.trim().length < 10 && !fileText) {
      setError('Say what you want to promote, paste a link, or attach a file.');
      return;
    }
    setError(null);
    setNote(null);
    setPhase(0);
    setBusy(true);
    trackEvent('distribute_started', { source: fileText ? 'file' : /https?:\/\/|\.[a-z]{2,}/i.test(text) ? 'link' : 'text' });
    try {
      const res = await fetch('/api/distribute/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, fileText, fileName, perDay, startDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.plan) {
        setError(data.error || 'That did not work. Try again.');
        return;
      }
      setPlan(data.plan as Plan);
      setStart(startDate);
    } catch {
      setError('Could not reach the writer. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
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
      .map((day) => `${prettyDate(day.date)} (${day.focus})\n` + day.posts.map((post) => `${post.time}  ${FORMAT_LABEL[post.format] ?? post.format}\n${post.caption}`).join('\n\n'))
      .join('\n\n------\n\n');
  }

  function downloadCsv() {
    if (!plan) return;
    const rows = [['Date', 'Time', 'Format', 'What to make', 'Caption'].map(csvCell).join(',')];
    for (const day of plan.days) for (const post of day.posts) rows.push([day.date, post.time, FORMAT_LABEL[post.format] ?? post.format, post.topic, post.caption].map(csvCell).join(','));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    link.download = `brandforge-week-${plan.start}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    trackEvent('distribute_downloaded', { source: 'csv' });
  }

  function startOver() {
    setPlan(null);
    setNote(null);
    setError(null);
  }

  if (!ready) return null;

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
        <p className="mt-1 text-sm text-muted">A week takes about half a minute.</p>
        <ol className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
          {PHASES.map((label, i) => (
            <li key={label} className={`h-1 w-10 rounded-full transition-colors duration-500 ${i <= phase ? 'bg-ember' : 'bg-line'}`} />
          ))}
        </ol>
      </div>
    );
  }

  if (plan) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm leading-relaxed text-muted">
          <span className="text-foreground">{plan.summary}</span>
          {plan.site ? ` Posts send people to ${plan.site}.` : ''}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void copy(weekText(), 'The whole week is copied.')} className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90">Copy the week</button>
          <button type="button" onClick={downloadCsv} className="rounded-xl border border-line px-4 py-2 text-sm text-foreground transition hover:border-ember">Download CSV</button>
          <button type="button" onClick={() => void write_(shift(plan.start, 7))} className="rounded-xl border border-line px-4 py-2 text-sm text-foreground transition hover:border-ember">Write next week</button>
          <button type="button" onClick={startOver} className="px-2 py-2 text-sm text-muted transition hover:text-foreground">Start over</button>
        </div>
        {note ? <p role="status" className="mt-2 text-xs text-muted">{note}</p> : null}
        {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
        {plan.plainDays > 0 ? <p className="mt-2 text-xs text-muted">{plan.plainDays === 1 ? 'One day uses' : `${plan.plainDays} days use`} simpler captions because the writer was busy. Write the week again to improve {plan.plainDays === 1 ? 'it' : 'them'}.</p> : null}

        <div className="mt-6 space-y-6">
          {plan.days.map((day, d) => (
            <section key={day.date} aria-label={prettyDate(day.date)}>
              <h2 className="flex items-baseline gap-2 font-serif text-xl text-foreground">
                {prettyDate(day.date)}
                <span className="text-xs font-normal text-muted">{day.focus}</span>
              </h2>
              <ul className="mt-2 space-y-2">
                {day.posts.map((post, p) => (
                  <li key={post.id} className="rounded-2xl border border-line bg-panel p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="tabular-nums text-muted">{post.time}</span>
                      <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">{FORMAT_LABEL[post.format] ?? post.format}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{post.topic}</span>
                    </div>
                    <textarea
                      value={post.caption}
                      onChange={(event) => editCaption(d, p, event.target.value)}
                      rows={Math.min(8, Math.max(3, Math.ceil(post.caption.length / 70) + post.caption.split('\n').length - 1))}
                      aria-label={`Caption for ${prettyDate(day.date)} at ${post.time}`}
                      className={`${field} mt-2 text-[13px] leading-relaxed`}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link href={makeLink(post)} onClick={() => trackEvent('next_step_clicked', { source: 'distribute_make' })} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90">
                        Make the {post.format === 'carousel' ? 'carousel' : 'picture'}
                      </Link>
                      <button type="button" onClick={() => void copy(post.caption, 'Caption copied.')} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember">Copy caption</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="font-serif text-2xl text-foreground sm:text-3xl">What do you want to promote?</h2>
      <p className="mt-1 text-sm text-muted">Describe it, paste a link, or attach a file. The AI writes your week.</p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        maxLength={2500}
        autoFocus
        placeholder="A bakery in Leeds selling sourdough on Saturdays, or https://yourwebsite.com"
        aria-label="What do you want to promote?"
        className={`${field} mt-4 text-base`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" accept=".txt,.md,.markdown,.csv,.json,.html,.htm,text/plain" className="hidden" onChange={(event) => void pickFile(event.target.files?.[0])} />
        <button type="button" onClick={() => fileInput.current?.click()} className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember hover:text-foreground">Attach a file</button>
        {fileName ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-overlay px-3 py-1.5 text-xs text-foreground">
            {fileName}
            <button type="button" aria-label="Remove the file" onClick={() => { setFileName(''); setFileText(''); }} className="text-muted hover:text-foreground">✕</button>
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Posts a day</p>
          <div className="mt-2 flex gap-2" role="group" aria-label="Posts a day">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setPerDay(n)} aria-pressed={perDay === n} className={`${chip} ${perDay === n ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>{n}</button>
            ))}
          </div>
        </div>
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Starts
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="mt-2 block rounded-xl border border-line bg-background px-3 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground focus:border-ember focus:outline-none" />
        </label>
      </div>

      {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
      <button type="button" onClick={() => void write_(start)} className="mt-6 rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-background transition hover:opacity-90">Write my week</button>
      <p className="mt-3 text-xs text-muted">Quotes, tips, carousels, ads and polls, spread over the day, each with a caption that asks for something different. Nothing is invented: it only uses what you give it.</p>
    </div>
  );
}
