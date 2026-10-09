'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trackEvent } from '@/lib/funnel-client';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50';

const KINDS: [string, string, string][] = [
  ['hook', 'Hook', 'The first line of a post'],
  ['caption', 'Caption', 'A social caption'],
  ['headline', 'Headline', 'A title or page headline'],
  ['ad', 'Ad', 'A short ad'],
];

type Result = { notes: string[]; variants: { text: string; why: string }[] };

// Optimize: what you can improve right now, with nothing invented. Audit a page, sharpen your own words, and
// a clear note about the part that needs a connected channel. No fake numbers anywhere.
export function OptimizeHub() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState('hook');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const validUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i.test(url.trim());

  function audit() {
    const address = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    try {
      window.sessionStorage.setItem('brandforge:pending-message', `Audit this site and tell me what to fix first: ${address}`);
    } catch {
      /* the chat still opens; the person pastes the address */
    }
    trackEvent('next_step_clicked', { source: 'optimize_audit' });
    router.push('/');
  }

  async function sharpen() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/optimize/sharpen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, text }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'That did not work. Try again.');
      setResult(data as Result);
      trackEvent('next_step_clicked', { source: 'optimize_sharpen' });
    } catch {
      setError('Could not reach the editor. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, index: number) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* the text stays on screen to select */
    }
  }

  return (
    <div className="max-w-3xl space-y-10">
      <section aria-label="Audit a page">
        <h2 className="font-serif text-2xl text-foreground">Audit a page</h2>
        <p className="mt-1 text-sm text-muted">Paste an address. You get a ranked list of what to fix first, read from the page itself.</p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (validUrl) audit();
          }}
        >
          <input className={field} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourstore.com" inputMode="url" autoCapitalize="none" aria-label="Page address" />
          <button type="submit" className={`${btnPrimary} shrink-0`} disabled={!validUrl}>Audit it</button>
        </form>
      </section>

      <section aria-label="Sharpen your words">
        <h2 className="font-serif text-2xl text-foreground">Sharpen your words</h2>
        <p className="mt-1 text-sm text-muted">Paste what you wrote. You get three stronger versions and why. It only works with what you gave it, so nothing is invented.</p>
        <div role="group" aria-label="What it is" className="mt-3 flex flex-wrap gap-1.5">
          {KINDS.map(([id, label, hint]) => (
            <button key={id} type="button" aria-pressed={kind === id} title={hint} onClick={() => setKind(id)} className={`rounded-full border px-3 py-1 text-xs transition ${kind === id ? 'border-ember bg-ember/15 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
        <textarea className={`${field} mt-3 min-h-28`} value={text} maxLength={1200} onChange={(event) => setText(event.target.value)} placeholder="We help small shops sell more with email newsletters that actually get read" aria-label="Your text" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} disabled={busy || text.trim().length < 8} onClick={() => void sharpen()}>{busy ? 'Sharpening…' : 'Sharpen it'}</button>
          <span className="text-xs tabular-nums text-muted">{text.length} / 1200</span>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}

        {result ? (
          <div className="mt-5 space-y-3" aria-live="polite">
            {result.notes.length > 0 ? (
              <ul className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">
                {result.notes.map((note) => (
                  <li key={note} className="py-0.5">• {note}</li>
                ))}
              </ul>
            ) : null}
            {result.variants.map((variant, index) => (
              <article key={index} className="rounded-xl border border-line bg-panel p-4">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{variant.text}</p>
                {variant.why ? <p className="mt-2 text-xs text-muted">{variant.why}</p> : null}
                <div className="mt-3 flex gap-2">
                  <button type="button" className={btn} onClick={() => void copy(variant.text, index)}>{copied === index ? 'Copied' : 'Copy'}</button>
                  <Link href="/create?make=update" className={btn}>Use in a post</Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-label="Results from your channels">
        <div className="relative rounded-2xl border border-dashed border-line bg-panel/60 p-5">
          <div className="pointer-events-none select-none opacity-60 blur-[3px]" aria-hidden="true">
            <div className="flex h-24 items-end gap-2">
              {[40, 65, 50, 85, 60, 95, 75].map((h, i) => (
                <div key={i} className="bf-grow flex-1 rounded-t bg-ember/60" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          </div>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line bg-background/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground shadow">Coming soon</span>
        </div>
        <h2 className="mt-4 font-serif text-xl text-foreground">What worked on your channels</h2>
        <p className="mt-1 text-sm text-muted">Reach, saves and clicks for each post, and which kind of post earned them. It appears once a platform lets us read your results. We will never show numbers we did not read.</p>
      </section>
    </div>
  );
}
