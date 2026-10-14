'use client';

import { useEffect, useState } from 'react';
import { ServiceTile, SERVICES, type ServiceId } from '@/components/integrations/brand-icons';

type Stats = { likes?: number; reposts?: number; replies?: number; views?: number };
type Published = { id: string; network: string; url: string; caption: string; createdAt: string; image: string | null; stats: Stats; ownerName: string; ownerAvatar: string | null };

function ago(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function Numbers({ stats }: { stats: Stats }) {
  const parts: [string, number | undefined][] = [
    ['views', stats.views],
    ['likes', stats.likes],
    ['reposts', stats.reposts],
    ['replies', stats.replies],
  ];
  const shown = parts.filter(([, n]) => typeof n === 'number');
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-foreground">
      {shown.map(([label, n]) => (
        <span key={label}>
          <span className="font-semibold">{short(n as number)}</span> <span className="text-muted">{label}</span>
        </span>
      ))}
    </span>
  );
}

// "Just published": the real posts members sent through BrandForge, newest first. Each card is a preview of the post as it
// went out (its picture and words), the network it lives on, and the public numbers the network shares.
export function PublishedFeed() {
  const [posts, setPosts] = useState<Published[] | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch('/api/published')
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((data: { posts?: Published[] }) => alive && setPosts(data.posts ?? []))
      .catch(() => alive && setPosts([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section aria-label="Just published" className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-foreground sm:text-2xl">Just published</h2>
        {posts && posts.length > 0 ? <p className="text-xs text-muted">Live on their networks</p> : null}
      </div>
      {posts === null ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bf-skeleton h-72 rounded-2xl bg-overlay" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Nothing published yet. Post or schedule a week and the posts show up here.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const known = Object.prototype.hasOwnProperty.call(SERVICES, post.network);
            const network = known ? SERVICES[post.network as ServiceId].name : host(post.url);
            return (
              <li key={post.id}>
                <a href={post.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-panel transition hover:border-ember">
                  <span className="flex items-center gap-2.5 px-3 py-2.5">
                    {known ? <ServiceTile id={post.network as ServiceId} on size={28} /> : <span className="h-7 w-7 shrink-0 rounded-lg bg-overlay" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{post.ownerName}</span>
                      <span className="block text-[11px] text-muted">{network} · {ago(post.createdAt)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ember opacity-0 transition group-hover:opacity-100">Open</span>
                  </span>
                  {post.image ? (
                    <span className="relative block aspect-[4/5] max-h-72 overflow-hidden bg-overlay">
                      {/* eslint-disable-next-line @next/next/no-img-element -- previews from our own bucket or the network's public image host */}
                      <img src={post.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                    </span>
                  ) : null}
                  <span className="flex flex-1 flex-col gap-2 px-3 py-2.5">
                    {post.caption ? <span className={`text-sm leading-snug text-foreground ${post.image ? 'line-clamp-2' : 'line-clamp-5'}`}>{post.caption}</span> : null}
                    <span className="mt-auto">
                      <Numbers stats={post.stats ?? {}} />
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
