"use client";

import Link from "next/link";
import { PLANS } from "@/lib/plans.js";
import { PayNow } from "@/components/pay-now";

// Software plans: Free makes and publishes everything; Pro puts the strongest AI on every piece. Each line is something
// the product does today (the router in lib/model-router.js reads the plan on every request).
export function PricingPlans() {
  return (
    <section className="px-6 py-10" aria-labelledby="software-plans">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-4 md:grid-cols-2">
          {PLANS.map((plan) => (
            <div key={plan.id} className={`relative flex flex-col rounded-3xl border p-6 ${plan.highlight ? "border-ember bg-panel shadow-[0_20px_60px_-30px_var(--ember)]" : "border-line bg-panel/70"}`}>
              {plan.highlight ? (
                <span className="absolute -top-3 left-6 rounded-full bg-ember px-3 py-1 text-[11px] font-semibold text-background">For people who publish every week</span>
              ) : null}
              <p className="font-serif text-2xl text-foreground">{plan.name}</p>
              <p className="mt-1 text-sm text-muted">{plan.blurb}</p>
              <p className="mt-5 flex items-baseline gap-1 text-foreground">
                <span className="font-serif text-4xl">{plan.price}</span>
                <span className="text-sm text-muted">{plan.cadence || " forever"}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm leading-snug text-foreground">
                    <span className={`mt-0.5 ${plan.highlight ? "text-ember" : "text-success"}`} aria-hidden="true">&#10003;</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {plan.cents > 0 ? (
                  <PayNow planId={plan.id} planName={plan.name} primary={Boolean(plan.highlight)} />
                ) : (
                  <Link href="/chat" className="block w-full rounded-xl border border-line px-4 py-2.5 text-center text-sm font-semibold text-foreground transition hover:border-ember">
                    Start free
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          Prices in euros, before tax. Contracts between members cost a flat 5% of each milestone when it is paid. Nothing else, and no late fees.
        </p>
      </div>
    </section>
  );
}
