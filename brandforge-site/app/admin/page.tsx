'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSessionUser } from '@/lib/browser-auth';

type Counts = Record<string, number>;

type HubData = {
  pendingApplications: number;
  funnelEvents: number;
  marketing: Counts | null;
  marketingNote: string;
  campaigns: Counts | null;
  campaignsNote: string;
};

function StatCard({
  title,
  stat,
  note,
  href,
  linkLabel,
}: {
  title: string;
  stat: string;
  note: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <a
      href={href}
      className="group rounded-2xl border border-line bg-panel p-6 transition hover:border-ember"
    >
      <h2 className="text-xs uppercase tracking-[0.2em] text-copper">{title}</h2>
      <p className="mt-3 font-serif text-4xl text-foreground">{stat}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{note}</p>
      <span className="mt-4 inline-block text-sm text-ember transition group-hover:underline">
        {linkLabel} →
      </span>
    </a>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [data, setData] = useState<HubData | null>(null);

  const load = useCallback(async () => {
    const [applications, funnel, marketing, campaigns] = await Promise.all([
      fetch('/api/admin/applications').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/funnel').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/admin/marketing').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/admin/campaigns')
        .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
        .catch(() => ({ ok: false, data: {} })),
    ]);

    if (!applications) {
      setAllowed(false);
      setLoading(false);
      return;
    }

    const pending = (applications.applications ?? []).filter(
      (app: { status: string }) => app.status === 'pending'
    ).length;

    const marketingCounts = marketing?.counts ?? null;
    const campaignCounts = campaigns.ok ? (campaigns.data.counts ?? null) : null;

    setData({
      pendingApplications: pending,
      funnelEvents: funnel?.window?.eventsCounted ?? 0,
      marketing: marketingCounts,
      marketingNote: marketing
        ? `${marketingCounts?.queued ?? 0} queued · ${marketingCounts?.posted ?? 0} posted · ${marketingCounts?.failed ?? 0} failed`
        : 'Queue unavailable',
      campaigns: campaignCounts,
      campaignsNote: campaigns.ok
        ? `${campaignCounts?.planned ?? 0} planned · ${(campaignCounts?.submitted ?? 0) + (campaignCounts?.in_progress ?? 0)} in progress · ${campaignCounts?.live ?? 0} live`
        : campaigns.data.pendingMigration
          ? 'Needs migration 0021 applied in the SQL editor'
          : 'Not available yet',
    });
    setAllowed(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const user = await getSessionUser();
      if (!user) {
        if (!cancelled) router.push('/login');
        return;
      }
      if (!cancelled) void load();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [load, router]);

  if (loading) {
    return (
      <AppShell title="Admin" subtitle="Product and distribution at a glance.">
        <p className="text-sm text-muted">Loading…</p>
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell title="Admin" subtitle="Product and distribution at a glance.">
        <div className="max-w-xl rounded-2xl border border-line bg-panel p-6">
          <h2 className="font-serif text-2xl text-foreground">Admins only</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            This dashboard is for BrandForge admins. Sign in with an admin account, or go back to
            chat.
          </p>
          <button
            type="button"
            onClick={() => router.push('/chat')}
            className="mt-5 rounded-xl border border-line bg-background px-4 py-2 text-sm text-foreground transition hover:border-ember"
          >
            Back to chat
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Admin"
      subtitle="Product and distribution at a glance."
      actions={
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-line px-4 py-2 text-sm text-foreground transition hover:border-ember"
        >
          Refresh
        </button>
      }
    >
      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-copper">
          Product <span className="ml-1 normal-case tracking-normal text-muted">— the build</span>
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <StatCard
            title="Applications"
            stat={String(data?.pendingApplications ?? 0)}
            note="Pending specialist applications waiting for review."
            href="/admin/applications"
            linkLabel="Review applications"
          />
          <StatCard
            title="Funnel"
            stat={(data?.funnelEvents ?? 0).toLocaleString()}
            note="Real recorded product events since launch."
            href="/admin/funnel"
            linkLabel="Open the funnel"
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-copper">
          Distribution <span className="ml-1 normal-case tracking-normal text-muted">— the advertising</span>
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <StatCard
            title="Marketing queue"
            stat={String(data?.marketing?.queued ?? 0)}
            note={data?.marketingNote ?? ''}
            href="/admin/marketing"
            linkLabel="Open the queue"
          />
          <StatCard
            title="Campaigns"
            stat={String(
              (data?.campaigns?.planned ?? 0) +
                (data?.campaigns?.in_progress ?? 0) +
                (data?.campaigns?.submitted ?? 0) +
                (data?.campaigns?.live ?? 0)
            )}
            note={data?.campaignsNote ?? ''}
            href="/admin/campaigns"
            linkLabel="Open the tracker"
          />
        </div>
      </section>

      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-muted">
        Numbers are direct counts of stored rows — no projections. The marketing queue publishes
        only when its kill switch is on; queued rows are drafts until then.
      </p>
    </AppShell>
  );
}
