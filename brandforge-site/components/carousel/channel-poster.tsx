'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/lib/funnel-client';
import { renderSlide, slideCount, type Draft, type Pictures } from '@/components/carousel/carousel-shared';
import { ServiceTile, SERVICES } from '@/components/integrations/brand-icons';
import { ChannelLinkForm } from '@/components/integrations/channel-link-form';
import { useChannels, type ChannelKind } from '@/components/integrations/use-channels';

const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50';
const KINDS: ChannelKind[] = ['telegram', 'discord', 'bluesky'];

// Posting a finished carousel to the channels the person has connected. Connected channels are tiles you
// tick; a platform that is not connected yet is one tap away. Only platforms that need no app approval
// are here. The slides are drawn in this browser (so their pictures and logo are in them) and sent to
// our server, which checks they are images and posts them.
export function ChannelPoster({ draft, pictures, captions, ready }: { draft: Draft; pictures: Pictures; captions: Record<string, string>; ready: boolean }) {
  const { channels, telegramLinked, loading, reload } = useChannels();
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<ChannelKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function slides(): Promise<Blob[]> {
    const out: Blob[] = [];
    const total = Math.min(10, slideCount(draft.plan));
    for (let i = 0; i < total; i++) {
      const canvas = document.createElement('canvas');
      renderSlide(canvas, i, draft, pictures);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
      if (blob) out.push(blob);
    }
    return out;
  }

  async function post() {
    const picked = channels.filter((c) => chosen[c.id]);
    if (picked.length === 0) return setNote({ tone: 'error', text: 'Pick a channel to post to.' });
    setBusy(true);
    setNote(null);
    try {
      const images = await slides();
      const lines: string[] = [];
      let failed = false;
      // One request per kind, because each platform gets its own caption.
      for (const k of KINDS) {
        const group = picked.filter((c) => c.kind === k);
        if (group.length === 0) continue;
        const form = new FormData();
        form.append('caption', k === 'bluesky' ? captions.x ?? '' : captions.facebook ?? captions.instagram ?? '');
        form.append('channelIds', JSON.stringify(group.map((c) => c.id)));
        images.forEach((blob, i) => form.append(`slide${i}`, blob, `slide-${i + 1}.png`));
        const res = await fetch('/api/carousel/publish', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failed = true;
          lines.push(data.error || 'Could not post.');
          continue;
        }
        for (const c of group) {
          const r = (data.results ?? {})[c.id] as { ok: boolean; note?: string } | undefined;
          if (r?.ok) lines.push(`${c.label}: posted`);
          else {
            failed = true;
            lines.push(`${c.label}: ${r?.note ?? 'not posted'}`);
          }
        }
      }
      trackEvent('carousel_downloaded', { source: 'channel' });
      setNote({ tone: failed ? 'error' : 'ok', text: lines.join(' · ') });
    } finally {
      setBusy(false);
    }
  }

  const pickedCount = channels.filter((c) => chosen[c.id]).length;

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-xl text-foreground">Post it now</p>
          <p className="mt-1 text-xs text-muted">Tick where it should go. Instagram, TikTok, LinkedIn and X need each platform to approve us first; <Link href="/settings#integrations" className="underline underline-offset-2 hover:text-foreground">see the list</Link>.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-hidden="true">
          {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-overlay" />)}
        </div>
      ) : channels.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {channels.map((c) => {
            const on = Boolean(chosen[c.id]);
            return (
              <li key={c.id}>
                <button type="button" role="checkbox" aria-checked={on} onClick={() => setChosen({ ...chosen, [c.id]: !on })} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${on ? 'border-ember bg-ember/10' : 'border-line hover:border-muted'}`}>
                  <ServiceTile id={c.kind} on size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{c.label}</span>
                    <span className="block text-xs text-muted">{SERVICES[c.kind].name}</span>
                  </span>
                  <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${on ? 'border-ember bg-ember text-background' : 'border-line text-transparent'}`}>✓</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-line p-4 text-center">
          <p className="text-sm text-foreground">Nothing connected yet</p>
          <p className="mt-1 text-xs text-muted">Connect a channel once and every carousel can go there in one tap.</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {KINDS.filter((k) => !channels.some((c) => c.kind === k)).map((k) => (
          <button key={k} type="button" aria-pressed={adding === k} onClick={() => setAdding(adding === k ? null : k)} className="flex items-center gap-2 rounded-full border border-dashed border-line py-1 pl-1 pr-3 text-xs text-muted transition hover:border-ember hover:text-foreground">
            <ServiceTile id={k} on={false} size={24} />
            Connect {SERVICES[k].name}
          </button>
        ))}
        {KINDS.every((k) => channels.some((c) => c.kind === k)) ? (
          <button type="button" className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={() => setAdding(adding ? null : 'telegram')}>Connect another channel</button>
        ) : null}
      </div>

      {adding ? (
        <div className="mt-3 rounded-xl border border-line p-3">
          <div role="tablist" aria-label="Platform to connect" className="mb-3 flex gap-1 border-b border-line">
            {KINDS.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={adding === k} onClick={() => setAdding(k)} className={`px-3 py-2 text-sm transition ${adding === k ? 'border-b-2 border-ember text-foreground' : 'text-muted hover:text-foreground'}`}>{SERVICES[k].name}</button>
            ))}
          </div>
          <ChannelLinkForm kind={adding} telegramLinked={telegramLinked} onLinked={(channel) => { setChosen((current) => ({ ...current, [channel.id]: true })); setAdding(null); setNote({ tone: 'ok', text: `${channel.label} is connected.` }); void reload(); }} />
        </div>
      ) : null}

      <div className="mt-4">
        <button type="button" className={btnPrimary} disabled={busy || !ready || pickedCount === 0} onClick={() => void post()}>
          {busy ? 'Posting…' : pickedCount === 0 ? 'Tick a channel to post' : `Post to ${pickedCount} channel${pickedCount === 1 ? '' : 's'}`}
        </button>
        <Link href="/settings#integrations" className={`${btn} ml-2 inline-block`}>Manage connections</Link>
      </div>

      {note ? <p role={note.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-xs ${note.tone === 'error' ? 'text-danger' : 'text-foreground'}`}>{note.text}</p> : null}
    </div>
  );
}
