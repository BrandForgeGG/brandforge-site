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
  // Only numbers worth showing: a row of zeros says nothing.
  const shown = parts.filter(([, n]) => typeof n === 'number' && n > 0);
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-foreground">
      {shown.map(([label, n]) => (
        <span key={label}>
          <span className="font-semibold">{short(n as number)}</span> {n === 1 ? ({ views: "view", likes: "like", reposts: "repost", replies: "reply" } as Record<string, string>)[label] : label}
        </span>
      ))}
    </span>
  );
}

// "Just published": the real posts members sent through BrandForge, newest first. Each card is a preview of the post as it
// went out (its picture and words), the network it lives on, and the public numbers the network shares.
type Group = { key: string; first: Published; networks: Published[]; stats: Stats };

// One card per post: the same words sent to several networks are one post with a link to each network.
function group(posts: Published[]): Group[] {
  const out: Group[] = [];
  for (const post of posts) {
    const key = `${post.ownerName}|${post.caption.trim()}`;
    const found = out.find((entry) => entry.key === key);
    if (found) {
      if (!found.networks.some((item) => item.network === post.network)) found.networks.push(post);
      for (const name of ['views', 'likes', 'reposts', 'replies'] as const) {
        if (typeof post.stats?.[name] === 'number') found.stats[name] = (found.stats[name] ?? 0) + (post.stats[name] as number);
      }
    } else {
      out.push({ key, first: post, networks: [post], stats: { ...(post.stats ?? {}) } });
    }
  }
  return out;
}

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
        {posts && posts.length > 0 ? <p className="text-xs text-foreground/70">Live on their networks</p> : null}
      </div>
      {posts === null ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bf-skeleton h-72 rounded-2xl bg-overlay" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-foreground/70">Nothing published yet. Post or schedule a week and the posts show up here.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {group(posts).slice(0, 6).map(({ key, first: post, networks, stats }) => (
            <li key={key} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-panel">
              <span className="flex items-center gap-2.5 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{post.ownerName}</span>
                  <span className="block text-[11px] text-foreground/70">{ago(post.createdAt)}</span>
                </span>
              </span>
              {post.image ? (
                <span className="relative block aspect-[4/5] max-h-72 overflow-hidden bg-overlay">
                  {/* eslint-disable-next-line @next/next/no-img-element -- previews from our own bucket or the network's public image host */}
                  <img src={post.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                </span>
              ) : null}
              <span className="flex flex-1 flex-col gap-2.5 px-3 py-2.5">
                {post.caption ? <span className={`text-sm leading-snug text-foreground ${post.image ? 'line-clamp-2' : 'line-clamp-5'}`}>{post.caption}</span> : null}
                <Numbers stats={stats} />
                <span className="mt-auto flex flex-wrap gap-1.5">
                  {networks.map((item) => {
                    const known = Object.prototype.hasOwnProperty.call(SERVICES, item.network);
                    return (
                      <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-xs text-foreground transition hover:border-ember">
                        {known ? <ServiceTile id={item.network as ServiceId} on size={20} /> : null}
                        {known ? SERVICES[item.network as ServiceId].name : host(item.url)}
                      </a>
                    );
                  })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
