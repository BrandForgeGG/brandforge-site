'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchAuthed, getSessionUser } from '@/lib/browser-auth';

type Creation = { conversationId: string; title: string; type: string; maker: string | null; coverUrl: string | null; hasVideo: boolean; youtubeUrl: string | null; shared: boolean; updatedAt: string };

const LABEL: Record<string, string> = { carousel: 'Carousel', image: 'Picture', article: 'Article', 'video:launch': 'Launch video', 'video:short': 'Short video', 'video:long': 'Long video', 'video:square': 'Video carousel' };
const labelOf = (c: Creation) => LABEL[c.type === 'video' ? `video:${c.maker}` : c.type] ?? 'Creation';

/** Which creations belong to a Create card: "video-launch" -> video made with the launch maker, "image-ad" -> pictures. */
function matches(card: string | undefined, c: Creation): boolean {
  if (!card) return true;
  if (card.startsWith('video-')) return c.type === 'video' && c.maker === card.slice(6);
  if (card.startsWith('image-')) return c.type === 'image';
  return c.type === card;
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Your creations: every one lives in its own chat, which is its draft and its history. Open one to keep working on it.
export function CreationsList({ card, title = 'Your creations' }: { card?: string; title?: string }) {
  const [items, setItems] = useState<Creation[] | null>(null);

  useEffect(() => {
    let live = true;
    void getSessionUser()
      .then(async (user) => {
        if (!user) return [];
        const res = await fetchAuthed('/api/creations');
        const data = (await res.json().catch(() => ({}))) as { creations?: Creation[] };
        return data.creations ?? [];
      })
      .catch(() => [])
      .then((list) => live && setItems(list.filter((c) => matches(card, c))));
    return () => {
      live = false;
    };
  }, [card]);

  if (!items || items.length === 0) return null;

  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-foreground">{title}</h2>
        <p className="text-xs text-muted">Each one is its own chat. Open it to keep shaping it.</p>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.slice(0, 12).map((c) => (
          <li key={c.conversationId}>
            <Link href={`/chat?conversationId=${c.conversationId}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-panel transition hover:border-ember">
              <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-background">
                {c.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the poster from our own storage
                  <img src={c.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                ) : (
                  <span className="px-3 text-center font-serif text-sm text-muted">{labelOf(c)}</span>
                )}
                {c.type === 'video' && c.hasVideo ? (
                  <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 translate-x-px fill-white"><path d="M6 3.5v13l11-6.5z" /></svg>
                    </span>
                  </span>
                ) : null}
              </span>
              <span className="flex flex-1 flex-col p-3">
                <span className="line-clamp-2 text-sm font-semibold text-foreground">{c.title || labelOf(c)}</span>
                <span className="mt-1 text-[11px] text-muted">{labelOf(c)} · {ago(c.updatedAt)}</span>
                {c.youtubeUrl || c.shared ? (
                  <span className="mt-2 flex flex-wrap gap-1 text-[10px]">
                    {c.youtubeUrl ? <span className="rounded-full bg-trust/15 px-2 py-0.5 text-success">On YouTube</span> : null}
                    {c.shared ? <span className="rounded-full bg-trust/15 px-2 py-0.5 text-success">Shared</span> : null}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
