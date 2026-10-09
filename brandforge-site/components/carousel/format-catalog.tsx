'use client';

import { useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { ServiceTile, SERVICES, type ServiceId } from '@/components/integrations/brand-icons';
import { FORMATS, GROUPS, STATUS_LABEL, type Format } from '@/lib/format-catalog.js';

const OTHER_NAMES: Record<string, string> = { reddit: 'Reddit', mastodon: 'Mastodon', threads: 'Threads', whatsapp: 'WhatsApp', pinterest: 'Pinterest', google: 'Google', medium: 'Medium' };

function Mark({ platform, on }: { platform: string; on: boolean }) {
  if (platform in SERVICES) return <ServiceTile id={platform as ServiceId} on={on} size={36} />;
  return (
    <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${on ? 'bg-ember text-background' : 'border border-dashed border-line bg-overlay text-muted'}`}>
      {(OTHER_NAMES[platform] ?? platform).slice(0, 1)}
    </span>
  );
}

const badge: Record<string, string> = {
  live: 'bg-trust/15 text-success',
  setup: 'bg-ember/15 text-ember',
  approval: 'bg-overlay text-muted',
  building: 'bg-overlay text-muted',
};

// Every format we are making, by platform, with an honest status. By default only what is live shows;
// "Show everything" adds the rest, each with the reason it is not usable yet and a way to ask for it
// (counted, so the next one built is the one people want). Live formats open their tool.
export function FormatCatalog({ onPick, groups, title = 'Formats' }: { onPick?: (format: Format) => void; groups?: string[]; title?: string }) {
  const [all, setAll] = useState(true);
  const [voted, setVoted] = useState<Record<number, boolean>>({});
  const shown = FORMATS.filter((f: Format) => (all || f.status === 'live') && (!groups || groups.includes(f.group)));
  const liveCount = FORMATS.filter((f: Format) => f.status === 'live').length;

  function vote(f: Format) {
    if (voted[f.n]) return;
    setVoted((current) => ({ ...current, [f.n]: true }));
    trackEvent('create_interest', { status: `format-${f.n}` });
  }

  return (
    <section aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-foreground">{title}</h2>
          <p className="text-xs text-muted">{liveCount} live now{all ? `, ${FORMATS.length - liveCount} more coming. Tap "I want this" on the ones you need and they move up.` : ''}.</p>
        </div>
        <div role="group" aria-label="Which formats to show" className="flex gap-1">
          {([[true, 'Live and coming'], [false, 'Live only']] as const).map(([value, label]) => (
            <button key={label} type="button" aria-pressed={all === value} onClick={() => setAll(value)} className={`rounded-full border px-3 py-1 text-xs transition ${all === value ? 'border-ember bg-ember/15 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-6">
        {GROUPS.map((group: { id: string; label: string }) => {
          const items = shown.filter((f: Format) => f.group === group.id).sort((a: Format, b: Format) => Number(b.status === 'live') - Number(a.status === 'live'));
          if (items.length === 0) return null;
          return (
            <div key={group.id}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{group.label}</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((f: Format) => {
                  const live = f.status === 'live';
                  const body = (
                    <>
                      <Mark platform={f.platform} on={live} />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm font-medium ${live ? 'text-foreground' : 'text-muted'}`}>{f.name}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge[f.status]}`}>{STATUS_LABEL[f.status as keyof typeof STATUS_LABEL]}</span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted">{f.line}</span>
                        {!live ? (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-disabled={voted[f.n]}
                            onClick={() => vote(f)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && vote(f)}
                            className="mt-1.5 inline-block text-xs text-ember underline-offset-2 hover:underline aria-disabled:text-muted aria-disabled:no-underline"
                          >
                            {voted[f.n] ? 'Noted, thanks' : 'I want this'}
                          </span>
                        ) : null}
                      </span>
                    </>
                  );
                  return (
                    <li key={f.n}>
                      {live ? (
                        <button type="button" onClick={() => onPick?.(f)} className="flex w-full items-start gap-3 rounded-xl border border-line bg-panel p-3 transition hover:border-ember">
                          {body}
                        </button>
                      ) : (
                        <div className="flex w-full items-start gap-3 rounded-xl border border-dashed border-line p-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export { OTHER_NAMES };
