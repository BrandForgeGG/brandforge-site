'use client';

import { useCallback, useEffect, useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { renderSlide, slideCount, type Draft, type Pictures } from '@/components/carousel/carousel-shared';

type Channel = { id: string; kind: 'telegram' | 'discord' | 'bluesky'; label: string };
type Kind = Channel['kind'];

const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50';
const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const KIND_LABEL: Record<Kind, string> = { telegram: 'Telegram channel', discord: 'Discord channel', bluesky: 'Bluesky' };

// Posting a finished carousel to channels the person has linked. Only platforms that need no app
// approval are here. The slides are drawn in this browser (so their pictures and logo are in them) and
// sent to our server, which checks they are images and posts them.
export function ChannelPoster({ draft, pictures, captions, ready }: { draft: Draft; pictures: Pictures; captions: Record<string, string>; ready: boolean }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [telegramLinked, setTelegramLinked] = useState(true);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [kind, setKind] = useState<Kind>('telegram');
  const [input, setInput] = useState({ channel: '', webhook: '', handle: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/carousel/channels').catch(() => null);
    if (res && res.ok) {
      const data = (await res.json()) as { channels: Channel[]; telegramLinked: boolean };
      setChannels(data.channels);
      setTelegramLinked(data.telegramLinked);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
  }, [load]);

  async function link() {
    setBusy(true);
    setNote(null);
    try {
      const body = kind === 'telegram' ? { kind, channel: input.channel } : kind === 'discord' ? { kind, webhook: input.webhook } : { kind, handle: input.handle, password: input.password };
      const res = await fetch('/api/carousel/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setNote({ tone: 'error', text: data.error || 'Could not link that.' });
      setInput({ channel: '', webhook: '', handle: '', password: '' });
      setAdding(false);
      setChosen((current) => ({ ...current, [data.channel.id]: true }));
      setNote({ tone: 'ok', text: `${data.channel.label} is linked.` });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function unlink(id: string) {
    await fetch(`/api/carousel/channels?id=${id}`, { method: 'DELETE' });
    setChosen((current) => ({ ...current, [id]: false }));
    await load();
  }

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
      for (const k of ['telegram', 'discord', 'bluesky'] as Kind[]) {
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

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <p className="font-serif text-xl text-foreground">Post it now</p>
      <p className="mt-1 text-xs text-muted">Link a channel once, then post this carousel there. Telegram, Discord and Bluesky work today. Instagram, TikTok, LinkedIn and X need each platform to approve us first.</p>

      {channels.length > 0 ? (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {channels.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <label className="flex min-w-0 items-center gap-2.5">
                <input type="checkbox" checked={Boolean(chosen[c.id])} onChange={(e) => setChosen({ ...chosen, [c.id]: e.target.checked })} />
                <span className="min-w-0"><span className="block truncate text-foreground">{c.label}</span><span className="block text-xs text-muted">{KIND_LABEL[c.kind]}</span></span>
              </label>
              <button type="button" className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={() => void unlink(c.id)}>Unlink</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No channel linked yet.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={busy || !ready || channels.length === 0} onClick={() => void post()}>{busy ? 'Working…' : 'Post to the checked channels'}</button>
        <button type="button" className={btn} onClick={() => setAdding(!adding)} aria-expanded={adding}>{adding ? 'Close' : 'Link a channel'}</button>
      </div>

      {adding ? (
        <div className="mt-4 space-y-3 rounded-xl border border-line p-3">
          <div role="tablist" aria-label="Platform to link" className="flex gap-1 border-b border-line">
            {(['telegram', 'discord', 'bluesky'] as Kind[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`px-3 py-2 text-sm transition ${kind === k ? 'border-b-2 border-ember text-foreground' : 'text-muted hover:text-foreground'}`}>{KIND_LABEL[k]}</button>
            ))}
          </div>
          {kind === 'telegram' ? (
            <>
              <p className="text-xs leading-relaxed text-muted">1. Add @brandforge_bot to your channel as an administrator that can post. 2. Make sure your own Telegram is linked in Settings. 3. Enter the channel name here. Only a channel administrator can link it.{telegramLinked ? '' : ' Your Telegram is not linked yet.'}</p>
              <label className="block text-sm text-foreground">Channel
                <input className={`${field} mt-1.5`} value={input.channel} onChange={(e) => setInput({ ...input, channel: e.target.value })} placeholder="@yourchannel" autoCapitalize="none" />
              </label>
            </>
          ) : null}
          {kind === 'discord' ? (
            <>
              <p className="text-xs leading-relaxed text-muted">In Discord: Edit Channel, Integrations, Webhooks, New Webhook, Copy Webhook URL. Paste it here. We keep it encrypted and only use it to post your carousels.</p>
              <label className="block text-sm text-foreground">Webhook address
                <input className={`${field} mt-1.5`} value={input.webhook} onChange={(e) => setInput({ ...input, webhook: e.target.value })} placeholder="https://discord.com/api/webhooks/…" autoCapitalize="none" autoComplete="off" />
              </label>
            </>
          ) : null}
          {kind === 'bluesky' ? (
            <>
              <p className="text-xs leading-relaxed text-muted">Use an app password, never your main one: Bluesky, Settings, App Passwords, Add. You can revoke it there at any time. We keep it encrypted. Long carousels go out as a thread, four pictures a post.</p>
              <label className="block text-sm text-foreground">Handle
                <input className={`${field} mt-1.5`} value={input.handle} onChange={(e) => setInput({ ...input, handle: e.target.value })} placeholder="name.bsky.social" autoCapitalize="none" />
              </label>
              <label className="block text-sm text-foreground">App password
                <input className={`${field} mt-1.5`} type="password" value={input.password} onChange={(e) => setInput({ ...input, password: e.target.value })} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" />
              </label>
            </>
          ) : null}
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void link()}>{busy ? 'Checking…' : 'Check and link'}</button>
        </div>
      ) : null}

      {note ? <p role={note.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-xs ${note.tone === 'error' ? 'text-danger' : 'text-foreground'}`}>{note.text}</p> : null}
    </div>
  );
}
