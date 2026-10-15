'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SERVICES, ServiceTile, type ServiceId } from '@/components/integrations/brand-icons';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';

export const CAROUSEL_PLATFORMS: ServiceId[] = ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'telegram', 'discord', 'bluesky', 'tumblr'];
export const TEXT_PLATFORMS: ServiceId[] = ['x', 'linkedin', 'facebook', 'telegram', 'discord', 'slack', 'bluesky', 'tumblr'];

export type CaptionControl = { value: (id: ServiceId) => string; onChange: (id: ServiceId, value: string) => void; limit: (id: ServiceId) => number; onWrite?: () => void; writing?: boolean };

// The last step after making something: edit the caption written for each place, then copy or download. Posting and
// scheduling moved to Distribute, which sends to the channels linked in Settings.
export function PublishPanel({ platforms, caption, copyText, fileName = 'post.txt' }: { platforms: ServiceId[]; caption?: CaptionControl; copyText?: string; fileName?: string }) {
  const [chosen, setChosen] = useState<ServiceId | null>(null);
  const [copied, setCopied] = useState(false);
  const active = chosen ?? platforms[0];

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the text stays selected for a manual copy */
    }
  }

  function download(text: string) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  const text = caption ? caption.value(active) : (copyText ?? '');
  const limit = caption ? caption.limit(active) : 0;

  return (
    <section aria-label="Captions" className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <p className="font-serif text-xl text-foreground">Captions</p>
      <p className="mt-0.5 text-xs text-muted">One written for each place.</p>

      <div role="group" aria-label="Caption for" className="mt-3 flex flex-wrap gap-2">
        {platforms.map((id) => {
          const on = id === active;
          return (
            <button key={id} type="button" aria-pressed={on} onClick={() => setChosen(id)} className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition ${on ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
              <ServiceTile id={id} on={on} size={26} />
              {SERVICES[id].name}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="publish-text" className="text-sm font-semibold text-foreground">{caption ? `${SERVICES[active].name} caption` : 'Text'}</label>
          {caption ? <span className="text-xs tabular-nums text-muted">{text.length} / {limit}</span> : null}
        </div>
        {caption ? (
          <textarea id="publish-text" className={`${field} mt-1.5 min-h-28`} value={text} maxLength={limit} onChange={(e) => caption.onChange(active, e.target.value)} />
        ) : (
          <textarea id="publish-text" className={`${field} mt-1.5 min-h-24`} value={text} readOnly />
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => void copy(text)} disabled={!text}>{copied ? 'Copied' : 'Copy'}</button>
          {!caption ? <button type="button" className={btn} onClick={() => download(text)} disabled={!text}>Download text</button> : null}
          {caption?.onWrite ? <button type="button" className={btn} disabled={caption.writing} onClick={caption.onWrite}>{caption.writing ? 'Writing…' : 'Write it with AI'}</button> : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Link href="/distribute" className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90">Post and schedule in Distribute</Link>
        <p className="min-w-0 flex-1 text-xs text-muted">Download or copy it here. Posting and scheduling live in Distribute.</p>
      </div>
    </section>
  );
}
