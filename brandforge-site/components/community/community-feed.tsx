'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchAuthed } from '@/lib/browser-auth';
import { COMMUNITY_SHARED } from '@/components/community/share-button';

type Post = { id: string; format: string; title: string; caption: string; images: string[]; video?: string | null; createdAt: string; ownerName: string; ownerAvatar: string | null; canRemove: boolean };

const FORMAT_LABEL: Record<string, string> = { 'video-launch': 'Launch video', 'video-short': 'Short video', 'video-long': 'Video', 'video-square': 'Video carousel', article: 'Article', carousel: 'Carousel', ad: 'Ad', quote: 'Quote', tip: 'Tip', announcement: 'Announcement', poll: 'Poll', question: 'Poll' };

function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.round(minutes / 1440)}d ago`;
  return new Date(then).toLocaleDateString();
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-overlay text-[10px] font-semibold text-foreground" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- a small user picture from our own storage */}
      {url ? <img src={url} alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" /> : initials(name)}
    </span>
  );
}

// "From the community": what people shared from Create or Distribute, newest first. Open one to see every slide and the
// caption; the person who shared it (or an admin) can take it down.
export function CommunityFeed({ kind, title }: { kind: 'create' | 'distribute'; title: string }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<Post | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      const res = await fetchAuthed(`/api/community?kind=${kind}${before ? `&before=${encodeURIComponent(before)}` : ''}`).catch(() => null);
      if (!res || !res.ok) {
        if (!before) setPosts([]);
        return;
      }
      const data = (await res.json()) as { posts: Post[] };
      setMore(data.posts.length >= 24);
      setPosts((current) => (before && current ? [...current, ...data.posts] : data.posts));
    },
    [kind],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
    const onShared = (event: Event) => {
      if ((event as CustomEvent).detail === kind) void load();
    };
    window.addEventListener(COMMUNITY_SHARED, onShared);
    return () => window.removeEventListener(COMMUNITY_SHARED, onShared);
  }, [load, kind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function remove(post: Post) {
    const res = await fetchAuthed(`/api/community?id=${post.id}`, { method: 'DELETE' }).catch(() => null);
    if (res && res.ok) {
      setPosts((current) => (current ?? []).filter((entry) => entry.id !== post.id));
      setOpen(null);
    }
  }

  return (
    <section aria-label={title} className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-foreground sm:text-2xl">{title}</h2>
        {posts && posts.length > 0 ? <p className="text-xs text-foreground/70">Shared by members</p> : null}
      </div>

      {posts === null ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bf-skeleton aspect-square rounded-2xl bg-overlay" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-foreground/70">Nothing shared yet. Make something above and press Share to the community to be the first.</p>
      ) : (
        <>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {posts.map((post) => (
              <li key={post.id}>
                <button type="button" onClick={() => setOpen(post)} className="group block w-full overflow-hidden rounded-2xl border border-line bg-panel text-left transition hover:border-ember">
                  <span className="relative block aspect-square overflow-hidden bg-overlay">
                    {/* eslint-disable-next-line @next/next/no-img-element -- member pictures from our own public bucket */}
                    <img src={post.images[0]} alt={post.title || 'Shared creation'} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                    {post.video ? (
                      <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition group-hover:scale-105">
                          <svg viewBox="0 0 20 20" className="h-4 w-4 translate-x-px fill-white"><path d="M6 3.5v13l11-6.5z" /></svg>
                        </span>
                      </span>
                    ) : post.images.length > 1 ? <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">1/{post.images.length}</span> : null}
                  </span>
                  <span className="block p-2.5">
                    <span className="block truncate text-sm text-foreground">{post.title || FORMAT_LABEL[post.format] || 'Creation'}</span>
                    <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-foreground/70">
                      <Avatar name={post.ownerName} url={post.ownerAvatar} />
                      <span className="min-w-0 flex-1 truncate">{post.ownerName}</span>
                      <span className="shrink-0">{relativeTime(post.createdAt)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {more ? (
            <div className="mt-4 text-center">
              <button type="button" onClick={() => void load(posts[posts.length - 1]?.createdAt)} className="rounded-full border border-line px-4 py-2 text-sm text-foreground transition hover:border-ember">
                Show more
              </button>
            </div>
          ) : null}
        </>
      )}

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div className="bf-login-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && setOpen(null)}>
              <div role="dialog" aria-modal="true" aria-label={open.title || 'Shared creation'} className="bf-login-panel max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line bg-panel p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Avatar name={open.ownerName} url={open.ownerAvatar} />
                  <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {open.ownerName} <span className="text-foreground/70">· {relativeTime(open.createdAt)}</span>
                  </p>
                  <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="rounded-lg p-2 text-foreground/70 transition hover:bg-overlay hover:text-foreground">
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                </div>
                {open.title ? <p className="mt-2 font-serif text-lg text-foreground">{open.title}</p> : null}
                {open.video ? (
                  <video src={open.video} poster={open.images[0]} controls playsInline preload="metadata" className="mt-3 max-h-[64dvh] w-full rounded-xl border border-line bg-black object-contain" />
                ) : null}
                <div className={`mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 ${open.video ? 'hidden' : ''}`}>
                  {open.images.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- member pictures from our own public bucket
                    <img key={src} src={src} alt={`${open.title || 'Creation'}, picture ${i + 1}`} className="max-h-[60dvh] w-auto max-w-full shrink-0 snap-center rounded-xl border border-line object-contain" />
                  ))}
                </div>
                {open.caption ? <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/70">{open.caption}</p> : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {open.caption ? (
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(open.caption).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember">
                      {copied ? 'Copied' : 'Copy caption'}
                    </button>
                  ) : null}
                  {open.canRemove ? (
                    <button type="button" onClick={() => void remove(open)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground/70 transition hover:border-danger hover:text-danger">
                      Remove from the community
                    </button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
