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

export function MakerChatCard({ conversationId, kind, state, onPosted, onClose }: { conversationId: string; kind: MakerKind; state?: unknown; onPosted: () => void; onClose: () => void }) {
  // Work in progress is kept on this device under the chat, so a refresh in the middle loses nothing.
  const draftId = `chat-${conversationId}-${kind}`;
  const chat = { conversationId, initialState: state, onPosted };
  return (
    <section aria-label={MAKER_LABEL[kind]} className="rounded-2xl border border-line bg-panel/60 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-serif text-lg text-foreground">{state ? `Edit your ${MAKER_LABEL[kind].toLowerCase()}` : MAKER_LABEL[kind]}</p>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-muted transition hover:text-foreground">Close</button>
      </div>
      {kind === 'video-launch' ? (
        <LaunchMaker draftId={draftId} chat={chat} />
      ) : kind === 'article' ? (
        <ArticleMaker draftId={draftId} chat={chat} />
      ) : (
        <VideoMaker initialFormat={kind.slice(6) as VideoFormat} draftId={draftId} chat={chat} />
      )}
    </section>
  );
}
