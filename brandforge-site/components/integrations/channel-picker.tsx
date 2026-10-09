'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ServiceTile, SERVICES } from '@/components/integrations/brand-icons';
import { ChannelLinkForm } from '@/components/integrations/channel-link-form';
import { useChannels, type ChannelKind } from '@/components/integrations/use-channels';

const KINDS: ChannelKind[] = ['telegram', 'discord', 'bluesky'];

// Where a post should go: the person's connected channels as tiles to tick, and a one-tap way to connect
// one that is missing. Used by every kind of post (carousel, update, poll, quiz, thread).
export function ChannelPicker({ value, onChange, onNote }: { value: Record<string, boolean>; onChange: (next: Record<string, boolean>) => void; onNote?: (text: string) => void }) {
  const { channels, telegramLinked, loading, reload } = useChannels();
  const [adding, setAdding] = useState<ChannelKind | null>(null);

  return (
    <div>
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-overlay" />
          ))}
        </div>
      ) : channels.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {channels.map((c) => {
            const on = Boolean(value[c.id]);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onChange({ ...value, [c.id]: !on })}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${on ? 'border-ember bg-ember/10' : 'border-line hover:border-muted'}`}
                >
                  <ServiceTile id={c.kind} on size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{c.label}</span>
                    <span className="block text-xs text-muted">{SERVICES[c.kind].name}</span>
                  </span>
                  <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${on ? 'border-ember bg-ember text-background' : 'border-line text-transparent'}`}>
                    ✓
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-line p-4 text-center">
          <p className="text-sm text-foreground">Nothing connected yet</p>
          <p className="mt-1 text-xs text-muted">Connect a channel once and every post can go there in one tap.</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {KINDS.filter((k) => !channels.some((c) => c.kind === k)).map((k) => (
          <button key={k} type="button" aria-pressed={adding === k} onClick={() => setAdding(adding === k ? null : k)} className="flex items-center gap-2 rounded-full border border-dashed border-line py-1 pl-1 pr-3 text-xs text-muted transition hover:border-ember hover:text-foreground">
            <ServiceTile id={k} on={false} size={24} />
            Connect {SERVICES[k].name}
          </button>
        ))}
        {KINDS.every((k) => channels.some((c) => c.kind === k)) ? (
          <button type="button" className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={() => setAdding(adding ? null : 'telegram')}>
            Connect another channel
          </button>
        ) : null}
        <Link href="/settings#integrations" className="ml-auto text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">
          Manage connections
        </Link>
      </div>

      {adding ? (
        <div className="mt-3 rounded-xl border border-line p-3">
          <div role="tablist" aria-label="Platform to connect" className="mb-3 flex gap-1 border-b border-line">
            {KINDS.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={adding === k} onClick={() => setAdding(k)} className={`px-3 py-2 text-sm transition ${adding === k ? 'border-b-2 border-ember text-foreground' : 'text-muted hover:text-foreground'}`}>
                {SERVICES[k].name}
              </button>
            ))}
          </div>
          <ChannelLinkForm
            kind={adding}
            telegramLinked={telegramLinked}
            onLinked={(channel) => {
              onChange({ ...value, [channel.id]: true });
              setAdding(null);
              onNote?.(`${channel.label} is connected.`);
              void reload();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
