'use client';

import Link from 'next/link';
import { RETAINERS } from '@/lib/plans.js';
import { trackEvent } from '@/lib/funnel-client';
import { PayNow } from '@/components/pay-now';

// The BrandForge team, by the month. Every plan starts in a chat (so the first question is answered by a person); once
// card and crypto payments are connected, a plan can also be paid for right here (Pay now).
export function RetainerPlans() {
  return (
    <section className="px-6 py-10" aria-labelledby="team-plans">
      <div className="mx-auto max-w-6xl">
        <h2 id="team-plans" className="text-center font-serif text-3xl text-foreground sm:text-4xl">Your own BrandForge team, by the month</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-muted">
          Rather have people do it? A person on the BrandForge team, with AI doing the first drafts, delivers the same things every month for a fixed price, in your own chat. Every team plan includes the Pro AI. Cancel any month.
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
                    <span className="text-ember" aria-hidden="true">&#10003;</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/chat?plan=${plan.id}`}
                onClick={() => trackEvent('plan_interest', { source: plan.id })}
                className={`mt-5 rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition hover:opacity-90 ${plan.highlight ? 'bg-ember text-on-ember' : 'border border-line text-foreground hover:border-ember'}`}
              >
                {plan.id === 'custom' ? 'Talk to us' : `Start with ${plan.name}`}
              </Link>
              {plan.cents > 0 ? (
                <div className="mt-2">
                  <PayNow planId={plan.id} planName={plan.name} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted">Prices are in euros and exclude tax. Your first chat is free and has no obligation. You only pay once you agree what you get.</p>
      </div>
    </section>
  );
}
