'use client';

import { useRef, useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { SERVICES, ServiceTile, type ServiceId } from '@/components/integrations/brand-icons';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';

export const CAROUSEL_PLATFORMS: ServiceId[] = ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'telegram', 'discord', 'bluesky', 'tumblr'];
export const TEXT_PLATFORMS: ServiceId[] = ['x', 'linkedin', 'facebook', 'telegram', 'discord', 'slack', 'bluesky', 'tumblr'];

function Lock() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 016 0V9" />
    </svg>
  );
}

export type CaptionControl = { value: (id: ServiceId) => string; onChange: (id: ServiceId, value: string) => void; limit: (id: ServiceId) => number; onWrite?: () => void; writing?: boolean };

// The last step after making something: choose where it will go, edit the caption written for that place,
// and publish. Publishing is locked for now, so the button says so plainly; choosing a platform is
// counted as interest, so we open the ones people want first. Downloading and copying work today.
export function PublishPanel({ platforms, caption, copyText, fileName = 'post.txt' }: { platforms: ServiceId[]; caption?: CaptionControl; copyText?: string; fileName?: string }) {
  const [picked, setPicked] = useState<ServiceId[]>([]);
  const [copied, setCopied] = useState(false);
  const counted = useRef(new Set<string>());
  const active = picked[picked.length - 1] ?? platforms[0];

  function toggle(id: ServiceId) {
    setPicked((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]));
    if (!counted.current.has(id)) {
      counted.current.add(id);
      trackEvent('create_interest', { status: `publish-${id}` });
    }
  }

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
    <section aria-label="Publish" className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <p className="font-serif text-xl text-foreground">Publish</p>
      <p className="mt-0.5 text-xs text-muted">Choose where it goes.</p>

      <div role="group" aria-label="Where to publish" className="mt-3 flex flex-wrap gap-2">
        {platforms.map((id) => {
          const on = picked.includes(id);
          return (
            <button key={id} type="button" aria-pressed={on} onClick={() => toggle(id)} className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition ${on ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
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
        <button type="button" disabled aria-disabled="true" title="Publishing opens as each platform approves us" className="flex cursor-not-allowed items-center gap-2 rounded-xl border border-line bg-overlay px-5 py-2.5 text-sm font-semibold text-muted">
          <Lock />
          Publish{picked.length > 0 ? ` to ${picked.length}` : ''}
        </button>
        <p className="min-w-0 flex-1 text-xs text-muted">Publishing opens soon. Download or copy it today.</p>
      </div>
    </section>
  );
}
