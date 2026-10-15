'use client';

import { useEffect, useState } from 'react';
import { DRAFTS_EVENT, deleteDraft, listDrafts, type Draft } from '@/components/drafts/drafts-store';

type Shown = Draft & { posterUrl: string | null; videoUrl: string | null };

function ago(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(time).toLocaleDateString();
}

// The drafts kept in this browser: what was made on Create and not published yet. Open one to carry on where you left
// off, download a finished video again, or delete it.
export function DraftsList({ kind, labelOf, onOpen, title = 'Your drafts' }: { kind?: string; labelOf: (kind: string) => string; onOpen: (draft: Draft) => void; title?: string }) {
  const [drafts, setDrafts] = useState<Shown[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let shown: Shown[] = [];
    const load = () =>
      void listDrafts(kind).then((list) => {
        if (!live) return;
        for (const old of shown) {
          if (old.posterUrl) URL.revokeObjectURL(old.posterUrl);
          if (old.videoUrl) URL.revokeObjectURL(old.videoUrl);
        }
        // Work in progress inside a chat belongs to that chat, not to this list.
        shown = list.filter((draft) => !draft.id.startsWith('chat-')).map((draft) => ({ ...draft, posterUrl: draft.poster ? URL.createObjectURL(draft.poster) : null, videoUrl: draft.video ? URL.createObjectURL(draft.video) : null }));
        setDrafts(shown);
      });
    load();
    window.addEventListener(DRAFTS_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(DRAFTS_EVENT, load);
      for (const old of shown) {
        if (old.posterUrl) URL.revokeObjectURL(old.posterUrl);
        if (old.videoUrl) URL.revokeObjectURL(old.videoUrl);
      }
    };
  }, [kind]);

  if (drafts.length === 0) return null;

  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-foreground">{title}</h2>
        <p className="text-xs text-muted">Kept in this browser until you publish them.</p>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel">
            <button type="button" onClick={() => onOpen(draft)} className="block text-left" aria-label={`Open ${draft.title || labelOf(draft.kind)}`}>
              <div className="flex aspect-video items-center justify-center overflow-hidden bg-background">
                {draft.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local file from this browser, not a page image
                  <img src={draft.posterUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="px-3 text-center font-serif text-sm text-muted">{labelOf(draft.kind)}</span>
                )}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold text-foreground">{draft.title || labelOf(draft.kind)}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {labelOf(draft.kind)} · {ago(draft.updatedAt)}
                  {draft.video ? ' · MP4 ready' : ''}
                </p>
              </div>
            </button>
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-xs">
              <button type="button" onClick={() => onOpen(draft)} className="font-semibold text-ember hover:underline">Open</button>
              {draft.videoUrl ? <a href={draft.videoUrl} download={`${(draft.title || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video'}.mp4`} className="text-foreground hover:underline">Download</a> : null}
              {confirming === draft.id ? (
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => void deleteDraft(draft.id).then(() => setConfirming(null))} className="text-danger hover:underline">Delete it</button>
                  <button type="button" onClick={() => setConfirming(null)} className="text-muted hover:text-foreground">Keep</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirming(draft.id)} className="ml-auto text-muted hover:text-foreground">Delete</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
