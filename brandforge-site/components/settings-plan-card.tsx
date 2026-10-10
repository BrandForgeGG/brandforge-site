'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

type Plan = { id: string; name: string; price: string; status: string; renews: string | null };

// "Your plan" in Settings: the monthly team plan paid by card, with Stripe's page for the card and cancelling.
export function SettingsPlanCard() {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchAuthed('/api/billing/status')
      .then((response) => (response.ok ? response.json() : { plan: null }))
      .then((data) => live && setPlan(data.plan ?? null))
      .catch(() => live && setPlan(null));
    return () => {
      live = false;
    };
  }, []);

  async function manage() {
    setOpening(true);
    try {
      const response = await fetchAuthed('/api/billing/portal');
      const data = await response.json().catch(() => ({}));
      if (data.url) window.location.assign(data.url as string);
    } finally {
      setOpening(false);
    }
  }

  if (plan === undefined) return null;
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-panel p-5">
      <h2 className="text-xl font-medium text-foreground">Your plan</h2>
      {plan ? (
        <div className="mt-3">
          <p className="text-base text-foreground">
            {plan.name} <span className="text-muted">{plan.price}/month</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {plan.status === 'past_due' ? 'The last payment did not go through. Update your card to keep it.' : plan.renews ? `Renews ${new Date(plan.renews).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.` : 'Active.'}
          </p>
          <button type="button" onClick={() => void manage()} disabled={opening} className="mt-3 rounded-lg border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-60">
            {opening ? 'Opening…' : 'Change card or cancel'}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          No monthly plan yet. <Link href="/pricing" className="text-ember underline-offset-2 hover:underline">See the BrandForge team plans</Link>.
        </p>
      )}
    </div>
  );
}
