'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/lib/funnel-client';
import { renderSlide, slideCount, type Draft, type Pictures } from '@/components/carousel/carousel-shared';
import { ChannelPicker } from '@/components/integrations/channel-picker';
import { useChannels } from '@/components/integrations/use-channels';

const btnPrimary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50';

// Posting a finished carousel to the channels the person has connected. Connected channels are tiles you
// tick; a platform that is not connected yet is one tap away. Only platforms that need no app approval
// are here. The slides are drawn in this browser (so their pictures and logo are in them) and sent to
// our server, which checks they are images and posts them.
export function ChannelPoster({ draft, pictures, captions, ready }: { draft: Draft; pictures: Pictures; captions: Record<string, string>; ready: boolean }) {
  const { channels } = useChannels();
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
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
      for (const k of ['telegram', 'discord', 'bluesky', 'tumblr'] as const) {
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

      <div className="mt-4">
        <ChannelPicker kinds={['telegram', 'discord', 'bluesky', 'tumblr']} value={chosen} onChange={setChosen} onNote={(text) => setNote({ tone: 'ok', text })} />
      </div>

      <div className="mt-4">
        <button type="button" className={btnPrimary} disabled={busy || !ready || pickedCount === 0} onClick={() => void post()}>
          {busy ? 'Posting…' : pickedCount === 0 ? 'Tick a channel to post' : `Post to ${pickedCount} channel${pickedCount === 1 ? '' : 's'}`}
        </button>
      </div>

      {note ? <p role={note.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-xs ${note.tone === 'error' ? 'text-danger' : 'text-foreground'}`}>{note.text}</p> : null}
    </div>
  );
}
