'use client';

import { useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import type { VideoFields } from '@/lib/video-embed.js';
import { ShareButton } from '@/components/community/share-button';
import { YouTubePost } from '@/components/video/youtube-post';
import { MAKER_LABEL, openMaker, type MakerKind } from '@/components/chat/maker-chat-card';
import { useCreationChat } from '@/components/chat/creation-context';

export type VideoEmbed = { type: 'video'; id: string } & VideoFields;

function madeAgo(iso: string | null): string {
  if (!iso) return '';
  const minutes = Math.round(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const btn = 'rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember disabled:opacity-60';

// A video made in this chat, as a message: one version of it, with its own date. Play it, download it, open it again
// in the maker to change it (the new version lands underneath), post it to YouTube or share it with the community.
// Publishing marks the version; it is never removed.
export function VideoMessageCard({ embed, createdAt }: { embed: VideoEmbed; createdAt: string | null }) {
  const { conversationId, isOwner, onChanged } = useCreationChat();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState(embed.youtubeUrl ?? null);
  const [shared, setShared] = useState(Boolean(embed.shared));
  const kind = `video-${embed.maker}` as MakerKind;

  async function link(): Promise<string | null> {
    if (url) return url;
    if (!embed.videoPath || !conversationId) return null;
    const res = await fetchAuthed(`/api/conversations/${conversationId}/video?path=${encodeURIComponent(embed.videoPath)}`);
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setNote(data.error || 'The video could not be loaded. Try again.');
      return null;
    }
    setUrl(data.url);
    return data.url;
  }

  async function play() {
    setBusy(true);
    setNote(null);
    await link();
    setBusy(false);
  }

  async function download() {
    setBusy(true);
    const address = await link();
    setBusy(false);
    if (!address) return;
    const res = await fetch(address).catch(() => null);
    if (!res || !res.ok) {
      setNote('The download did not start. Try again.');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(embed.title || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video'}.mp4`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function mark(patch: { youtubeUrl?: string; shared?: boolean }) {
    if (!conversationId) return;
    await fetchAuthed(`/api/conversations/${conversationId}/creation`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: embed.id, ...patch }) }).catch(() => null);
    onChanged();
  }

  async function blobOf(address: string | null): Promise<Blob | null> {
    if (!address) return null;
    const res = await fetch(address).catch(() => null);
    return res && res.ok ? res.blob() : null;
  }

  return (
    <div className="w-full max-w-xl rounded-2xl border border-line bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{MAKER_LABEL[kind]}{embed.seconds ? ` · ${Math.round(embed.seconds)}s` : ''}</p>
        <p className="text-[11px] text-muted">{madeAgo(createdAt)}</p>
      </div>
      <p className="mt-1 font-serif text-lg leading-snug text-foreground">{embed.title}</p>

      <div className={`relative mt-2 overflow-hidden rounded-xl border border-line bg-black ${embed.vertical ? 'mx-auto aspect-[9/16] max-h-[60vh]' : 'aspect-video'}`}>
        {url ? (
          <video src={url} poster={embed.coverUrl} controls autoPlay playsInline className="h-full w-full object-contain" />
        ) : (
          <button type="button" onClick={() => void play()} disabled={busy || !embed.videoPath} className="group absolute inset-0 flex items-center justify-center" aria-label="Play the video">
            {embed.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the poster from our own storage
              <img src={embed.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
            ) : null}
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition group-hover:scale-105">
              {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <svg viewBox="0 0 20 20" className="h-5 w-5 translate-x-px fill-white" aria-hidden="true"><path d="M6 3.5v13l11-6.5z" /></svg>}
            </span>
          </button>
        )}
      </div>

      {youtubeUrl || shared ? (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {youtubeUrl ? <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-trust/15 px-2.5 py-1 text-success hover:underline">On YouTube ↗</a> : null}
          {shared ? <span className="rounded-full bg-trust/15 px-2.5 py-1 text-success">Shared to the community</span> : null}
        </div>
      ) : null}

      {isOwner ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => openMaker(kind, embed.state)} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90">Edit</button>
          {embed.videoPath ? (
            <>
              <button type="button" onClick={() => void download()} disabled={busy} className={btn}>Download</button>
              <button type="button" onClick={() => setPosting((value) => !value)} aria-expanded={posting} className={btn}>{youtubeUrl ? 'Post again to YouTube' : 'Post to YouTube'}</button>
              {shared ? null : (
                <ShareButton
                  kind="create"
                  format={kind}
                  title={embed.title}
                  getImages={async () => {
                    const poster = await blobOf(embed.coverUrl ?? null);
                    return poster ? [poster] : [];
                  }}
                  getVideo={async () => blobOf(await link())}
                  onShared={() => {
                    setShared(true);
                    void mark({ shared: true });
                  }}
                  className={btn}
                />
              )}
            </>
          ) : null}
        </div>
      ) : null}
      {note ? <p role="alert" className="mt-2 text-xs text-danger">{note}</p> : null}
      {posting && embed.videoPath ? (
        <YouTubePost
          keptPath={embed.videoPath}
          defaultTitle={embed.title}
          defaultDescription={embed.title}
          vertical={embed.vertical}
          seconds={embed.seconds ?? 0}
          onPosted={(posted) => {
            if (posted) {
              setYoutubeUrl(posted);
              void mark({ youtubeUrl: posted });
            }
          }}
        />
      ) : null}
    </div>
  );
}
