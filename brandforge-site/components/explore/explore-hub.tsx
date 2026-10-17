'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DIRECTION, ROADMAP, STATUS_LABEL, type RoadmapStatus } from '@/lib/roadmap.js';
import { donateUrl } from '@/lib/locked-channels.js';
import { UsageStats } from '@/components/explore/usage-stats';

type Activity = { kind: string; at: string; who: string; text: string; href: string; image?: string; external?: boolean };

// What each kind of line is, in one word and one colour.
const KIND_LABEL: Record<string, { label: string; tone: string }> = {
  joined: { label: 'New member', tone: 'bg-trust/15 text-success' },
  chat: { label: 'Chat', tone: 'bg-overlay text-foreground' },
  carousel: { label: 'Create', tone: 'bg-ember/15 text-ember' },
  shared: { label: 'Shared', tone: 'bg-ember/15 text-ember' },
  published: { label: 'Published', tone: 'bg-trust/15 text-success' },
  listing: { label: 'Trade', tone: 'bg-overlay text-foreground' },
  applied: { label: 'Team', tone: 'bg-overlay text-foreground' },
  contract: { label: 'Contract', tone: 'bg-trust/15 text-success' },
};

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
    const load = async () => {
      const res = await fetch('/api/activity').catch(() => null);
      const data = res && res.ok ? ((await res.json().catch(() => null)) as { items?: Activity[] } | null) : null;
      if (alive) setActivity(data?.items ?? []);
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 120_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="max-w-5xl space-y-10">
      <UsageStats />
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
            Live, from real members
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
            {activity.map((item, i) => {
              const tag = KIND_LABEL[item.kind] ?? { label: item.kind, tone: 'bg-overlay text-muted' };
              const body = (
                <>
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- member pictures from our own public bucket
                    <img src={item.image} alt="" loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" />
                  ) : (
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold uppercase ${tag.tone}`} aria-hidden="true">
                      {tag.label.slice(0, 2)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      <span className="font-medium">{item.who}</span> <span className="text-muted">{item.text}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${tag.tone}`}>{tag.label}</span>
                      {ago(item.at)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={`${item.kind}-${item.at}-${i}`}>
                  {item.external ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 px-4 py-3 transition hover:bg-overlay">{body}</a>
                  ) : (
                    <Link href={item.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-overlay">{body}</Link>
                  )}
                </li>
              );
            })}
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
      <section className="rounded-3xl border border-ember/40 bg-panel p-6">
        <p className="font-serif text-2xl text-foreground">Rather have it all done for you?</p>
        <p className="mt-1 text-sm text-muted">Development, design, video and marketing by real people. Monthly from €690, or one task at a time. Full refund if month one isn&apos;t delivered.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <a href="/pricing" className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90">See plans</a>
          <a href="/chat" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">Talk to the team</a>
        </div>
      </section>
    </div>
  );
}
