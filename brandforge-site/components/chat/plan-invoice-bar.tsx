'use client';

import { useState } from 'react';
import { RETAINERS } from '@/lib/plans.js';
import { fetchAuthed } from '@/lib/browser-auth';

// Staff only, in a client's chat: once a monthly plan is agreed, one click sends its invoice card into the chat.
export function PlanInvoiceBar({ conversationId, onSent }: { conversationId: string; onSent: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function send(planId: string, label: string) {
    if (!window.confirm(`Send the ${label} invoice to this client?`)) return;
    setBusy(planId);
    setNote('');
    const res = await fetchAuthed(`/api/conversations/${conversationId}/plan-invoice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: planId }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok) return setNote(data.error || 'Could not send it.');
    setNote('Invoice sent.');
    onSent();
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">Plan agreed? Send the invoice:</span>
      {RETAINERS.map((plan) => (
        <button key={plan.id} type="button" disabled={Boolean(busy)} onClick={() => void send(plan.id, `${plan.name} ${plan.price}${plan.cadence}`)} className="rounded-full border border-line px-3 py-1 font-semibold text-foreground transition hover:border-ember disabled:opacity-50">
          {busy === plan.id ? 'Sending…' : `${plan.name} ${plan.price}`}
        </button>
      ))}
      {note ? <span role="status" className="text-muted">{note}</span> : null}
    </div>
  );
}
