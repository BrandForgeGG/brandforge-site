'use client';

import { getRetainer } from '@/lib/plans.js';
import { PayNow } from '@/components/pay-now';

// The invoice for a monthly team plan, sent by the team once it was agreed in this chat. The client pays right here; the
// payment marks it Paid and starts month 1 (its work list appears in the chat).
export function PlanInvoiceCard({ planId, status, canPay, conversationId }: { planId: string; status: string; canPay: boolean; conversationId: string }) {
  const plan = getRetainer(planId);
  if (!plan) return null;
  const paid = status === 'paid';
  return (
    <div className="mx-auto my-4 w-full max-w-md rounded-3xl border border-ember/40 bg-panel p-5 shadow-[0_20px_60px_-40px_var(--ember)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Invoice</p>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${paid ? 'bg-trust/15 text-success' : 'bg-ember/15 text-ember'}`}>{paid ? 'Paid' : 'Waiting for payment'}</span>
      </div>
      <p className="mt-2 font-serif text-2xl text-foreground">{plan.name}</p>
      <p className="mt-1 flex items-baseline gap-1 text-foreground">
        <span className="font-serif text-3xl">{plan.price}</span>
        <span className="text-sm text-muted">{plan.cadence}</span>
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-foreground">
        {plan.deliverables.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-ember" aria-hidden="true">&#10003;</span>
            {item}
          </li>
        ))}
      </ul>
      {paid ? (
        <p className="mt-4 text-sm text-muted">Your month&apos;s work list is in this chat.</p>
      ) : canPay ? (
        <div className="mt-5">
          <PayNow planId={plan.id} planName={plan.name} primary chatId={conversationId} label={`Pay ${plan.price} and start`} />
          <p className="mt-2 text-center text-xs text-muted">Monthly, cancel any time. If month one isn&apos;t delivered, you get a full refund.</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Sent to the client.</p>
      )}
    </div>
  );
}
