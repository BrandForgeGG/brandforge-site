'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { fetchAuthed } from '@/lib/browser-auth';
import { formatMoney } from '@/lib/peer-contract.js';
import type { PeerView } from '@/lib/peer-contract-view';

export default function AdminContractsPage() {
  const [contracts, setContracts] = useState<PeerView[] | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchAuthed('/api/peer-contracts?staff=1');
      if (response.status === 403 || response.status === 401) return setState('denied');
      if (!response.ok) return setState('error');
      const data = await response.json();
      setContracts(data.contracts ?? []);
      setState('ok');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
  }, [load]);

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetchAuthed(`/api/peer-contracts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setNote(data.error || 'That did not work.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const button = 'rounded-lg border border-line px-3 py-1.5 text-xs text-foreground disabled:opacity-60';
  const primary = 'rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60';

  const deposits = (contracts ?? []).filter((c) => c.fundingStatus === 'verifying');
  const disputes = (contracts ?? []).flatMap((c) =>
    c.milestones.map((m, index) => ({ c, m, index })).filter(({ m }) => m.status === 'disputed'),
  );
  const payouts = (contracts ?? []).flatMap((c) => c.payoutsDue.map((p) => ({ c, p })));

  return (
    <AppShell title="Contracts" subtitle="Deposits to check, disputes to decide, payouts to send.">
      {state === 'loading' ? <p className="text-sm text-muted">Loading…</p> : null}
      {state === 'denied' ? <p className="text-sm text-muted">Admins only.</p> : null}
      {state === 'error' ? <p className="text-sm text-muted">Could not load the queue.</p> : null}
      {state === 'ok' ? (
        <div className="max-w-3xl space-y-6">
          {note ? <p className="text-xs text-ember" role="alert">{note}</p> : null}

          <section>
            <h2 className="text-xs uppercase tracking-[0.18em] text-copper">Deposits to check ({deposits.length})</h2>
            {deposits.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing waiting.</p> : null}
            {deposits.map((c) => (
              <div key={c.id} className="bf-card mt-2 p-4">
                <p className="text-sm text-foreground">{c.title}</p>
                <p className="text-xs text-muted">{c.payer.name} to fund {c.totalLabel}</p>
                <p className="mt-1 break-all text-xs text-foreground">Reference: {c.fundingTx}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy} className={primary} onClick={() => void act(c.id, { action: 'verify_funding', approve: true })}>Mark funded</button>
                  <button type="button" disabled={busy} className={button} onClick={() => void act(c.id, { action: 'verify_funding', approve: false })}>Reject</button>
                  <a className={button} href={`/chat?conversationId=${c.conversationId}`}>Open chat</a>
                </div>
              </div>
            ))}
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-[0.18em] text-copper">Disputes ({disputes.length})</h2>
            {disputes.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing in review.</p> : null}
            {disputes.map(({ c, m, index }) => (
              <div key={`${c.id}-${index}`} className="bf-card mt-2 p-4">
                <p className="text-sm text-foreground">{c.title}: {m.title} ({formatMoney(m.amountCents, c.currency)})</p>
                <p className="text-xs text-muted">{c.payer.name} paid, {c.payee.name} delivered</p>
                {m.note ? <p className="mt-1 text-xs text-foreground">Issue: {m.note}</p> : null}
                {m.proofUrl ? <a href={m.proofUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block text-xs text-ember underline">View the work</a> : null}
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy} className={primary} onClick={() => void act(c.id, { action: 'resolve_dispute', index, outcome: 'release' })}>Release to {c.payee.name}</button>
                  <button type="button" disabled={busy} className={button} onClick={() => void act(c.id, { action: 'resolve_dispute', index, outcome: 'refund' })}>Refund {c.payer.name}</button>
                  <a className={button} href={`/chat?conversationId=${c.conversationId}`}>Open chat</a>
                </div>
              </div>
            ))}
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-[0.18em] text-copper">Payouts to send ({payouts.length})</h2>
            {payouts.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing to pay.</p> : null}
            {payouts.map(({ c, p }) => {
              const person = p.toSide === 'payee' ? c.payee : c.payer;
              return (
                <div key={`${c.id}-${p.index}`} className="bf-card mt-2 p-4">
                  <p className="text-sm text-foreground">
                    {p.kind === 'payout' ? 'Pay' : 'Refund'} {person.name} {formatMoney(p.amountCents, c.currency)}
                  </p>
                  <p className="text-xs text-muted">
                    {c.title}: {c.milestones[p.index].title}
                    {p.feeCents ? `, BrandForge keeps ${formatMoney(p.feeCents, c.currency)}` : ''}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy} className={primary} onClick={() => void act(c.id, { action: 'mark_paid', index: p.index })}>Mark as paid</button>
                    <a className={button} href={`/chat?conversationId=${c.conversationId}`}>Open chat</a>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
