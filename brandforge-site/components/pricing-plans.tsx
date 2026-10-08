"use client";

import Link from "next/link";
import { useState } from "react";
import { PLANS } from "@/lib/plans.js";
import { trackEvent } from "@/lib/funnel-client";

// Software plans. Paid plans are not on sale yet, so the button records interest honestly.
export function PricingPlans() {
  const [asked, setAsked] = useState<string | null>(null);

  return (
    <section className="px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center font-serif text-2xl text-foreground">Create and distribute for free. Pay when you scale.</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">
          AI, images and video never cost extra. Plans raise your limits and unlock team and channel features.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`flex flex-col rounded-2xl border bg-panel p-5 ${plan.highlight ? "border-ember" : "border-line"}`}
            >
              <p className="font-serif text-lg text-foreground">{plan.name}</p>
              <p className="mt-1 text-xs text-muted">{plan.blurb}</p>
              <p className="mt-3 text-2xl text-foreground">
                {plan.price}
                <span className="text-xs text-muted">{plan.cadence}</span>
              </p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="text-xs text-muted">
                    ✓ {feature}
                  </li>
                ))}
              </ul>
              {plan.id === "free" ? (
                <Link href="/chat" className="mt-4 rounded-lg bg-ember px-3 py-2 text-center text-xs font-semibold text-background">
                  Start free
                </Link>
              ) : asked === plan.id ? (
                <p className="mt-4 text-center text-xs text-trust-light" role="status">
                  Noted. We&apos;ll tell you the day {plan.name} opens.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    trackEvent("plan_interest", { source: plan.id });
                    setAsked(plan.id);
                  }}
                  className="mt-4 rounded-lg border border-line px-3 py-2 text-xs text-foreground transition hover:border-ember"
                >
                  Get early access
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Contracts between members cost a flat 5% of each milestone when it is released. Nothing else, and no late fees.
        </p>
      </div>
    </section>
  );
}
