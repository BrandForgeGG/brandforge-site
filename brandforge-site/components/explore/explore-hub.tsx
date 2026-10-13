'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DIRECTION, ROADMAP, STATUS_LABEL, type RoadmapStatus } from '@/lib/roadmap.js';
import { donateUrl } from '@/lib/locked-channels.js';

type Activity = { id: string; what: string; title: string; who: string; at: string; href: string; image?: string };

const TONE: Record<RoadmapStatus, string> = {
  live: 'bg-trust/15 text-success',
  building: 'bg-ember/15 text-ember',
  next: 'bg-overlay text-muted',
};

function ago(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

// Explore: where BrandForge is going, what members are doing right now (real activity only), and the roadmap in three
// honest columns. The same calm frame as Create, Distribute and Trade.
export function ExploreHub() {
  const [activity, setActivity] = useState<Activity[] | null>(null);

  useEffect(() => {
    let alive = true;
    const read = async <T,>(url: string): Promise<T | null> => {
      const res = await fetch(url).catch(() => null);
      return res && res.ok ? ((await res.json().catch(() => null)) as T | null) : null;
    };
    void Promise.all([
      read<{ listings?: { id: string; title: string; ownerName: string; createdAt: string; kind: string; official?: boolean }[] }>('/api/trade'),
      read<{ posts?: { id: string; title: string; ownerName: string; createdAt: string; images: string[] }[] }>('/api/community?kind=create'),
      read<{ posts?: { id: string; title: string; ownerName: string; createdAt: string; images: string[] }[] }>('/api/community?kind=distribute'),
    ]).then(([trade, made, posted]) => {
      if (!alive) return;
      const items: Activity[] = [
        ...(trade?.listings ?? []).filter((row) => !row.official).map((row) => ({ id: `t-${row.id}`, what: row.kind === 'request' ? 'needs' : 'offers', title: row.title, who: row.ownerName, at: row.createdAt, href: '/trade' })),
        ...(made?.posts ?? []).map((row) => ({ id: `c-${row.id}`, what: 'made', title: row.title || 'a creation', who: row.ownerName, at: row.createdAt, href: '/create', image: row.images[0] })),
        ...(posted?.posts ?? []).map((row) => ({ id: `d-${row.id}`, what: 'is posting', title: row.title || 'a post', who: row.ownerName, at: row.createdAt, href: '/distribute', image: row.images[0] })),
      ];
      items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setActivity(items.slice(0, 12));
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="max-w-5xl space-y-10">
      <section aria-label="Where we are going">
        <h2 className="font-serif text-2xl text-foreground sm:text-3xl">Where we are going</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {DIRECTION.map((item) => (
            <li key={item.title} className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <p className="font-serif text-lg text-foreground">{item.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Happening now">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl text-foreground sm:text-2xl">Happening now</h2>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success motion-reduce:animate-none" aria-hidden="true" />
            From members, live
          </span>
        </div>
        {activity === null ? (
          <div className="mt-4 space-y-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bf-skeleton h-14 rounded-xl bg-overlay" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Quiet right now. List something in Trade or share what you made, and it shows up here.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {activity.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-overlay">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- member pictures from our own public bucket
                    <img src={item.image} alt="" loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-overlay text-xs font-semibold text-muted" aria-hidden="true">
                      {item.who.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      <span className="font-medium">{item.who}</span> <span className="text-muted">{item.what}</span> {item.title}
                    </span>
                    <span className="block text-xs text-muted">{ago(item.at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Roadmap">
        <h2 className="font-serif text-xl text-foreground sm:text-2xl">What is live, what we are building, what needs to happen</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(['live', 'building', 'next'] as RoadmapStatus[]).map((status) => (
            <div key={status} className="rounded-2xl border border-line bg-panel/50 p-3 sm:p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${TONE[status]}`}>{STATUS_LABEL[status]}</span>
                <span>{ROADMAP.filter((item) => item.status === status).length}</span>
              </p>
              <ul className="mt-3 space-y-2">
                {ROADMAP.filter((item) => item.status === status).map((item) => (
                  <li key={item.title} className="rounded-xl border border-line bg-panel p-3">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          Want something sooner? Tell us in the chat, or{' '}
          <a href={donateUrl()} target="_blank" rel="noopener noreferrer" className="text-ember underline-offset-2 hover:underline">
            help us get there
          </a>
          .
        </p>
      </section>
    </div>
  );
}
