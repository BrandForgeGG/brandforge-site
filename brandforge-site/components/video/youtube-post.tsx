'use client';

import Link from 'next/link';
import { useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/funnel-client';
import { useChannels } from '@/components/integrations/use-channels';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';

// Posting a finished video to YouTube: pick the channel, check the title and description, post now or pick a time
// (YouTube itself publishes it then). The file goes from this browser into private storage, the server hands it to YouTube,
// and the stored copy is deleted.
// With keptPath (a video already kept with its chat), nothing is uploaded again and the kept copy stays.
export function YouTubePost({ blob, keptPath, defaultTitle, defaultDescription, vertical, seconds, onPosted }: { blob?: Blob; keptPath?: string; defaultTitle: string; defaultDescription: string; vertical: boolean; seconds: number; onPosted?: (url?: string) => void }) {
  const { channels, loading } = useChannels(true);
  const youtube = channels.filter((channel) => channel.kind === 'youtube');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState(defaultTitle.slice(0, 90));
  const [description, setDescription] = useState(defaultDescription.slice(0, 4900));
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const chosen = picked.length > 0 ? picked : youtube.map((channel) => channel.id);

  async function post() {
    if (busy || chosen.length === 0) return;
    setOutcome(null);
    try {
      let path = keptPath ?? '';
      if (!path) {
        if (!blob) throw new Error('There is no video to post yet.');
        setBusy('Uploading the video…');
        const slot = await fetchAuthed('/api/video/upload-url', { method: 'POST' });
        const slotData = (await slot.json().catch(() => ({}))) as { path?: string; token?: string; error?: string };
        if (!slot.ok || !slotData.path || !slotData.token) throw new Error(slotData.error || 'Could not prepare the upload.');
        const { error: uploadError } = await supabase.storage.from('videos').uploadToSignedUrl(slotData.path, slotData.token, blob, { contentType: 'video/mp4' });
        if (uploadError) throw new Error('The video did not upload. Check your connection and try again.');
        path = slotData.path;
      }
      setBusy('Sending it to YouTube…');
      const res = await fetchAuthed('/api/video/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, channelIds: chosen, title, description, publishAt: when ? new Date(when).toISOString() : null, vertical, seconds }),
      });
      const data = (await res.json().catch(() => ({}))) as { results?: Record<string, { ok: boolean; note?: string; url?: string }>; error?: string };
      if (!res.ok || !data.results) throw new Error(data.error || 'Could not post the video.');
      const results = Object.values(data.results);
      const good = results.find((result) => result.ok);
      if (good) {
        onPosted?.(good.url);
        setOutcome({ ok: true, text: when ? `Uploaded. YouTube publishes it on ${new Date(when).toLocaleString()}.${good.note ? ` ${good.note}` : ''}` : `Posted to YouTube.${good.note ? ` ${good.note}` : ''}`, url: good.url });
        trackEvent('carousel_published', { status: when ? 'youtube-scheduled' : 'youtube' });
      } else {
        setOutcome({ ok: false, text: results.map((result) => result.note).filter(Boolean).join(' ') || 'YouTube refused the video.' });
      }
    } catch (cause) {
      setOutcome({ ok: false, text: cause instanceof Error ? cause.message : 'Could not post the video.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-panel p-3">
      <p className="text-sm font-semibold text-foreground">Post to YouTube</p>
      {loading ? (
        <p className="mt-1 text-xs text-muted">Loading your channels…</p>
      ) : youtube.length === 0 ? (
        <p className="mt-1 text-xs text-muted">
          No YouTube channel linked yet. <Link href="/settings#integrations" className="text-ember underline-offset-2 hover:underline">Connect YouTube in Settings</Link>, then come back to this video.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {youtube.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="YouTube channels">
              {youtube.map((channel) => {
                const on = chosen.includes(channel.id);
                return (
                  <button key={channel.id} type="button" aria-pressed={on} onClick={() => setPicked((current) => (current.includes(channel.id) ? current.filter((id) => id !== channel.id) : [...current, channel.id]))} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted'}`}>
                    {channel.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted">{youtube[0].label}</p>
          )}
          <input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 90))} aria-label="Video title" placeholder="Title" className={field} />
          <textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 4900))} rows={3} aria-label="Video description" placeholder="Description" className={`${field} text-[13px]`} />
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Publish at (optional)
            <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className="rounded-lg border border-line bg-background px-2 py-1 text-xs text-foreground" />
          </label>
          <button type="button" onClick={() => void post()} disabled={Boolean(busy) || title.trim().length < 3} className="rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">
            {busy ?? (when ? 'Schedule on YouTube' : vertical && seconds <= 180 ? 'Post as a Short' : 'Post to YouTube')}
          </button>
        </div>
      )}
      {outcome ? (
        <p role={outcome.ok ? 'status' : 'alert'} className={`mt-2 text-xs ${outcome.ok ? 'text-success' : 'text-danger'}`}>
          {outcome.text}{' '}
          {outcome.url ? (
            <a href={outcome.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Open it</a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
