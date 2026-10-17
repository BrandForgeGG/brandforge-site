"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PLANS, RETAINERS, TEAM_INCLUDES } from "@/lib/plans.js";
import { TaskMenu } from "@/components/task-menu";
import { CustomTaskCard } from "@/components/custom-task-card";
import { PayNow } from "@/components/pay-now";
import { trackEvent } from "@/lib/funnel-client";

type Tab = "teams" | "software";

// A scheduling page (Cal.com, Calendly) when NEXT_PUBLIC_BOOKING_URL is set; until then the team's Telegram.
const BOOKING = (process.env.NEXT_PUBLIC_BOOKING_URL || "").trim();
const BOOKING_IS_CALENDAR = /^https:\/\//.test(BOOKING);
const BOOKING_URL = BOOKING_IS_CALENDAR ? BOOKING : "https://t.me/headstartup";

type Card = { id: string; name: string; price: string; cadence: string; blurb: string; features: string[]; highlight?: boolean; soon?: boolean; cents: number };

// Team plans start with a chat: the team answers, you agree what you get, then the invoice arrives in that chat. Software
// plans are bought straight away.
function PlanCard({ plan, team }: { plan: Card; team: boolean }) {
  return (
    <div className={`relative flex flex-col rounded-3xl border p-6 ${plan.highlight ? "border-ember bg-panel shadow-[0_20px_60px_-30px_var(--ember)]" : "border-line bg-panel/70"} ${plan.soon ? "opacity-70" : ""}`}>
      {plan.highlight ? <span className="absolute -top-3 left-6 rounded-full bg-ember px-3 py-1 text-[11px] font-semibold text-on-ember">Most popular</span> : null}
      {plan.soon ? <span className="absolute -top-3 left-6 rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-semibold text-muted">Coming soon</span> : null}
      <p className="font-serif text-2xl text-foreground">{plan.name}</p>
      <p className="mt-1 text-sm text-muted">{plan.blurb}</p>
      <p className="mt-5 flex items-baseline gap-1 text-foreground">
        <span className="font-serif text-4xl">{plan.price}</span>
        <span className="text-sm text-muted">{plan.cadence}</span>
      </p>
      <ul className="mt-5 flex-1 space-y-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-sm leading-snug text-foreground">
            <span className={`mt-0.5 ${plan.highlight ? "text-ember" : "text-success"}`} aria-hidden="true">&#10003;</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 space-y-2">
        {plan.soon ? (
          <span className="block w-full rounded-xl border border-dashed border-line px-4 py-2.5 text-center text-sm text-muted">Soon</span>
        ) : plan.cents === 0 ? (
          <Link href="/chat" className="block w-full rounded-xl border border-line px-4 py-2.5 text-center text-sm font-semibold text-foreground transition hover:border-ember">Start free</Link>
        ) : team ? (
          <Link
            href={`/chat?plan=${plan.id}`}
            onClick={() => trackEvent("plan_interest", { source: plan.id })}
            className={`block w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition hover:opacity-90 ${plan.highlight ? "bg-ember text-on-ember" : "border border-line text-foreground hover:border-ember"}`}
          >
            Talk to us about {plan.name}
          </Link>
        ) : (
          <PayNow planId={plan.id} planName={plan.name} primary={Boolean(plan.highlight)} />
        )}
      </div>
    </div>
  );
}

// One pricing block: a growth team by the month, or the software on its own.
// `bare`: inside a section that already sets the page column (the homepage), so no padding or width of its own.
// `tasks`: the What a task can be menu under the team plans (the homepage shows it as its own section instead).
export function PricingPlans({ bare = false, tasks = true }: { bare?: boolean; tasks?: boolean }) {
  const [tab, setTab] = useState<Tab>("teams");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a #software link opens that tab
    if (window.location.hash === "#software") setTab("software");
  }, []);
  const plans: Card[] = tab === "teams" ? RETAINERS : PLANS;

  return (
    <section id="plans" className={bare ? "scroll-mt-20 pt-8" : "scroll-mt-20 px-5 py-10 sm:px-8"} aria-label="Plans">
      <div className={bare ? "" : "mx-auto max-w-6xl"}>
        <div role="tablist" aria-label="Plan type" className="mx-auto flex w-fit rounded-full border border-line bg-panel p-1">
          {(["teams", "software"] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${tab === id ? "bg-ember text-on-ember" : "text-muted hover:text-foreground"}`}
            >
              {id === "teams" ? "Teams" : "Software"}
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {plans.map((plan) => <PlanCard key={plan.id} plan={plan} team={tab === "teams"} />)}
          {tab === "teams" ? <CustomTaskCard /> : null}
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          {tab === "teams" ? <>Monthly or one time: chat first, pay when you agree. Monthly plans include: {TEAM_INCLUDES.join(" · ")}</> : <>Prices in euros, before tax. No late fees.</>}
        </p>
        {tab === "teams" ? (
          <p className="mt-2 text-center text-sm">
            <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("plan_interest", { source: "call" })} className="font-semibold text-foreground underline-offset-4 hover:underline">
              {BOOKING_IS_CALENDAR ? "Book a 15-min call" : "Questions? Message us"}
            </a>
          </p>
        ) : null}
        {tab === "teams" && tasks ? <TaskMenu /> : null}
      </div>
    </section>
  );
}
