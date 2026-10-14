'use client';

import { useEffect, useState } from 'react';
import { ServiceTile, SERVICES, type ServiceId } from '@/components/integrations/brand-icons';

type Published = { id: string; network: string; url: string; caption: string; createdAt: string; ownerName: string; ownerAvatar: string | null };

function ago(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// "Just published": the real posts members sent through BrandForge, newest first, each a link to the post on its network.
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
        <div className="mt-4 space-y-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bf-skeleton h-16 rounded-xl bg-overlay" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Nothing published yet. Post or schedule a week and the links show up here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
          {posts.map((post) => {
            const known = Object.prototype.hasOwnProperty.call(SERVICES, post.network);
            return (
              <li key={post.id}>
                <a href={post.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 px-4 py-3 transition hover:bg-overlay">
                  {known ? <ServiceTile id={post.network as ServiceId} on size={36} /> : <span className="h-9 w-9 shrink-0 rounded-xl bg-overlay" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{post.caption || 'A new post'}</span>
                    <span className="block truncate text-xs text-muted">
                      {post.ownerName} on {known ? SERVICES[post.network as ServiceId].name : host(post.url)} · {ago(post.createdAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-ember">Open</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
