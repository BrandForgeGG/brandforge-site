'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSessionUser } from '@/lib/browser-auth';

type FunnelResponse = {
  window: { firstEventAt: string | null; lastEventAt: string | null; eventsCounted: number };
  events: { event: string; count: number }[];
};

const FOUNDER_STEPS = [
  'landing_viewed',
  'signin_started',
  'chat_started',
  'project_described',
  'review_requested',
  'proposal_received',
  'proposal_accepted',
  'funding_submitted',
  'funding_verified',
  'milestone_completed',
  'payment_released',
  'repeat_project_started',
];

const SPECIALIST_STEPS = ['apply_started', 'apply_submitted', 'application_approved'];

const LABELS: Record<string, string> = {
  landing_viewed: 'Landing viewed',
  signin_started: 'Sign-in started',
  chat_started: 'Chat started',
  project_described: 'Project described',
  review_requested: 'Review requested',
  proposal_received: 'Proposal received',
  proposal_accepted: 'Proposal accepted',
  funding_submitted: 'Funding submitted',
  funding_verified: 'Funding verified',
  milestone_completed: 'Milestone completed',
  payment_released: 'Payment released',
  repeat_project_started: 'Repeat project started',
  apply_started: 'Apply started',
  apply_submitted: 'Application submitted',
  application_approved: 'Application approved',
};

function shortDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function FunnelColumn({
  title,
  steps,
  counts,
}: {
  title: string;
  steps: string[];
  counts: Map<string, number>;
}) {
  const top = Math.max(1, ...steps.map((step) => counts.get(step) ?? 0));

  return (
    <section className="min-w-0 flex-1">
      <h2 className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">{title}</h2>
      <ul className="mt-4 space-y-2">
        {steps.map((step) => {
          const count = counts.get(step) ?? 0;
          const width = count === 0 ? 0 : Math.max(4, Math.round((count / top) * 100));
          return (
            <li key={step} className="rounded-xl border border-white/10 bg-[#1c2024] p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-[#ece7de]">{LABELS[step] ?? step}</span>
                {/* An explicit zero matters: a step with no data is not the same as a missing step. */}
                <span className={`font-mono text-sm ${count === 0 ? 'text-[#8f959b]' : 'text-[#ece7de]'}`}>
                  {count}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full ${count === 0 ? 'bg-transparent' : 'bg-[#e8571e]'}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}


export default function AdminFunnelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/funnel');
    if (!response.ok) {
      setError(response.status === 403 ? 'Admin access only.' : 'Funnel data is not available yet.');
      setLoading(false);
      return;
    }
    const payload = (await response.json()) as FunnelResponse;
    setData(payload);
    setError('');
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
      <AppShell title="Funnel" subtitle="Real product events, nothing projected.">
        <p className="text-sm text-[#9aa0a6]">Loading…</p>
      </AppShell>
    );
  }


  const counts = new Map((data?.events ?? []).map((entry) => [entry.event, entry.count]));
  const total = data?.window.eventsCounted ?? 0;
  const first = shortDate(data?.window.firstEventAt ?? null);
  const last = shortDate(data?.window.lastEventAt ?? null);

  return (
    <AppShell title="Funnel" subtitle="Real product events, nothing projected.">
      {error ? (
        <div className="max-w-2xl rounded-2xl border border-white/10 bg-[#1c2024] p-6">
          <h2 className="font-serif text-2xl text-[#ece7de]">Not available</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#9aa0a6]">{error}</p>
          {error.includes('not available') ? (
            <p className="mt-3 text-sm leading-relaxed text-[#8f959b]">
              This usually means migration <code className="font-mono">0012_funnel_events.sql</code> has
              not been applied to the database yet. Until it is, these numbers stay at zero on purpose
              rather than being estimated.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="max-w-2xl rounded-2xl border border-white/10 bg-[#1c2024] p-6">
            <h2 className="font-serif text-2xl text-[#ece7de]">Measurement window</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#9aa0a6]">
              {total === 0
                ? 'No events recorded yet.'
                : `${total.toLocaleString()} event${total === 1 ? '' : 's'} recorded between ${first ?? '?'} and ${last ?? '?'}.`}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#8f959b]">
              These are counts of real recorded events, not projections and not modelled figures. Treat
              small numbers as directional only — they are not a growth rate, and there is no
              denominator to divide by yet.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm text-[#ece7de] transition hover:border-[#e8571e]"
            >
              Refresh
            </button>
          </div>

          <div className="flex flex-col gap-8 lg:flex-row">
            <FunnelColumn title="Founder funnel" steps={FOUNDER_STEPS} counts={counts} />
            <FunnelColumn title="Specialist funnel" steps={SPECIALIST_STEPS} counts={counts} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
