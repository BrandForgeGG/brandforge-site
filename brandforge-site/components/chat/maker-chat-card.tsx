'use client';

import dynamic from 'next/dynamic';
import type { VideoFormat } from '@/lib/video-scenes.js';

// A maker (launch video, short/long/square video, article) working inside its chat. The chat is the creation's draft:
// every version made lands in the thread as its own message, and "Edit" on a version opens it here again.

export type MakerKind = 'video-launch' | 'video-short' | 'video-long' | 'video-square' | 'article';
export const MAKER_KINDS: MakerKind[] = ['video-launch', 'video-short', 'video-long', 'video-square', 'article'];
export const MAKER_LABEL: Record<MakerKind, string> = { 'video-launch': 'Launch video', 'video-short': 'Short vertical video', 'video-long': 'Long video', 'video-square': 'Video carousel', article: 'Article' };
export const isMakerKind = (value: unknown): value is MakerKind => typeof value === 'string' && (MAKER_KINDS as string[]).includes(value);

/** Asks the open chat to show a maker (from a version's Edit button). */
export const OPEN_MAKER_EVENT = 'bf:open-maker';
export function openMaker(kind: MakerKind, state?: unknown): void {
  window.dispatchEvent(new CustomEvent(OPEN_MAKER_EVENT, { detail: { kind, state } }));
}

const seedKey = (conversationId: string) => `bf:chat-maker:${conversationId}`;

/** A new chat started from Create: the maker is waiting in it when it opens. */
export function seedMakerCard(conversationId: string, kind: MakerKind): void {
  try {
    window.localStorage.setItem(seedKey(conversationId), kind);
  } catch {
    /* storage blocked: the chat opens without the card; the person can ask for it */
  }
}

export function readMakerSeed(conversationId: string | null): MakerKind | null {
  if (!conversationId) return null;
  try {
    const value = window.localStorage.getItem(seedKey(conversationId));
    return isMakerKind(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearMakerSeed(conversationId: string | null): void {
  if (!conversationId) return;
  try {
    window.localStorage.removeItem(seedKey(conversationId));
  } catch {
    /* nothing kept */
  }
}

const loading = () => <div className="bf-skeleton h-64 rounded-2xl bg-overlay" />;
const LaunchMaker = dynamic(() => import('@/components/video/launch-maker').then((mod) => mod.LaunchMaker), { ssr: false, loading });
const VideoMaker = dynamic(() => import('@/components/video/video-maker').then((mod) => mod.VideoMaker), { ssr: false, loading });
const ArticleMaker = dynamic(() => import('@/components/article/article-maker').then((mod) => mod.ArticleMaker), { ssr: false, loading });

// Hide folds the maker into one line and keeps everything in it (words, pictures, voice); Open brings it back as it was.
// Discard removes it from the chat.
export function MakerChatCard({ conversationId, kind, state, hidden = false, onPosted, onHide, onShow, onClose }: { conversationId: string; kind: MakerKind; state?: unknown; hidden?: boolean; onPosted: () => void; onHide: () => void; onShow: () => void; onClose: () => void }) {
  // Work in progress is kept on this device under the chat, so a refresh in the middle loses nothing.
  const draftId = `chat-${conversationId}-${kind}`;
  const chat = { conversationId, initialState: state, onPosted };
  return (
    <section aria-label={MAKER_LABEL[kind]} className="rounded-2xl border border-line bg-panel/60 p-3 sm:p-4">
      <div className={`flex items-center justify-between gap-2 ${hidden ? '' : 'mb-3'}`}>
        <button type="button" onClick={hidden ? onShow : onHide} className="min-w-0 text-left" aria-expanded={!hidden}>
          <span className="block truncate font-serif text-lg text-foreground">{state ? `Edit your ${MAKER_LABEL[kind].toLowerCase()}` : MAKER_LABEL[kind]}</span>
          {hidden ? <span className="block text-xs text-muted">Still here, with everything you made. Open it to carry on.</span> : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {hidden ? (
            <button type="button" onClick={onShow} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-on-ember transition hover:opacity-90">Open</button>
          ) : (
            <button type="button" onClick={onHide} className="rounded-lg px-2 py-1 text-xs text-muted transition hover:text-foreground">Hide</button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-muted transition hover:text-danger">Discard</button>
        </div>
      </div>
      {/* Kept mounted while hidden, so nothing in it is lost. */}
      <div className={hidden ? 'hidden' : ''}>
        {kind === 'video-launch' ? (
          <LaunchMaker draftId={draftId} chat={chat} />
        ) : kind === 'article' ? (
          <ArticleMaker draftId={draftId} chat={chat} />
        ) : (
          <VideoMaker initialFormat={kind.slice(6) as VideoFormat} draftId={draftId} chat={chat} />
        )}
      </div>
    </section>
  );
}
