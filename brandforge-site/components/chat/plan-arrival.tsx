import { getRetainer } from '@/lib/plans.js';

// Arriving from a plan on the pricing page: what that plan delivers each month, and what happens next, before the first message.
export function PlanArrival({ planId }: { planId: string }) {
  const plan = getRetainer(planId);
  if (!plan) return null;
  return (
    <div className="mt-7 w-full max-w-md rounded-3xl border border-line bg-panel p-5 text-left">
      <p className="flex items-baseline justify-between gap-3">
        <span className="font-serif text-xl text-foreground">{plan.name}</span>
        <span className="text-foreground">{plan.price}<span className="text-sm text-muted">{plan.cadence}</span></span>
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-foreground">
        {plan.deliverables.map((item) => (
          <li key={item} className="flex gap-2"><span className="text-ember" aria-hidden="true">&#10003;</span>{item}</li>
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Chat → agree → the invoice arrives here → work starts. Full refund if month one isn&apos;t delivered.</p>
    </div>
  );
}
