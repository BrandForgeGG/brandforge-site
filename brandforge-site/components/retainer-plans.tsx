'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RETAINERS } from '@/lib/plans.js';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import { useLogin } from '@/components/login-dialog';

// The BrandForge team, by the month. Every plan starts in a chat (so the first question is answered by a person); when
// card payment is switched on, a plan can also be paid for right here.
export function RetainerPlans() {
  const { openLogin } = useLogin();
  const [cardOpen, setCardOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch('/api/billing/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => live && setCardOpen(Boolean(data?.checkout)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function payByCard(planId: string) {
    setBusy(planId);
    setError(null);
    trackEvent('plan_interest', { source: `card-${planId}` });
    try {
      const response = await fetchAuthed('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: planId }) });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        openLogin({ reason: 'signin', next: '/pricing' });
        return;
      }
      if (!response.ok || !data.url) {
        setError(data.error || 'Card payment could not start. Ask for the plan in the chat.');
        return;
      }
      window.location.assign(data.url as string);
    } catch {
      setError('Connection problem. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="px-6 py-10" aria-labelledby="team-plans">
      <div className="mx-auto max-w-6xl">
        <h2 id="team-plans" className="text-center font-serif text-3xl text-foreground sm:text-4xl">Your own BrandForge team, by the month</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-muted">
          A person on the team, with AI doing the first drafts, delivers the same things every month for a fixed price. Cancel any month. You talk to a human in your own chat.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RETAINERS.map((plan) => (
            <div key={plan.id} className={`flex flex-col rounded-2xl border bg-panel p-5 ${plan.highlight ? 'border-ember' : 'border-line'}`}>
              {plan.highlight ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ember">Most chosen to start</p> : null}
              <p className="font-serif text-xl text-foreground">{plan.name}</p>
              <p className="mt-1 text-xs text-muted">{plan.blurb}</p>
              <p className="mt-4 text-3xl text-foreground">
                {plan.price}
                <span className="text-xs text-muted">{plan.cadence}</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{plan.bestFor}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-xs leading-relaxed text-foreground">
                    <span className="text-ember" aria-hidden="true">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/chat?plan=${plan.id}`}
                onClick={() => trackEvent('plan_interest', { source: plan.id })}
                className={`mt-5 rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition hover:opacity-90 ${plan.highlight ? 'bg-ember text-background' : 'border border-line text-foreground hover:border-ember'}`}
              >
                {plan.id === 'custom' ? 'Talk to us' : `Start with ${plan.name}`}
              </Link>
              {cardOpen && plan.cents > 0 ? (
                <button type="button" onClick={() => void payByCard(plan.id)} disabled={busy === plan.id} className="mt-2 text-xs text-muted underline-offset-2 transition hover:text-foreground hover:underline disabled:opacity-60">
                  {busy === plan.id ? 'Opening payment…' : 'Pay by card now'}
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {error ? <p role="alert" className="mt-4 text-center text-sm text-danger">{error}</p> : null}
        <p className="mt-5 text-center text-xs text-muted">Prices are in euros and exclude tax. Your first chat is free and has no obligation. You only pay once you agree what you get.</p>
      </div>
    </section>
  );
}
