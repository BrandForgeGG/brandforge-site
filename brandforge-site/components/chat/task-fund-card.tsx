'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import { CryptoCheckout, readCryptoAssets } from '@/components/crypto-checkout';

type Live = { role: 'buyer' | 'team'; status: 'open' | 'countered' | 'accepted' | 'funded'; amount: number; counterAmount?: number; counterNote?: string };

const STATUS: Record<Live['status'], { label: string; tone: string }> = {
  open: { label: 'With the team', tone: 'bg-overlay text-foreground' },
  countered: { label: 'Counter offer', tone: 'bg-ember/15 text-ember' },
  accepted: { label: 'Ready to fund', tone: 'bg-ember/15 text-ember' },
  funded: { label: 'Funded', tone: 'bg-trust/15 text-success' },
};

const euros = (n: number) => `€${n.toLocaleString('en-US')}`;

// A custom task in its chat. The team accepts it or counters with another amount; the buyer answers a counter; once both
// agree the buyer funds it (card or crypto). BrandForge holds the money and releases it when the buyer approves the work.
export function TaskFundCard({ agreementId, status, title, amount }: { agreementId: string; status: string; title?: string; amount?: number; canPay: boolean }) {
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [countering, setCountering] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterNote, setCounterNote] = useState('');
  const [crypto, setCrypto] = useState(false);
  const [cryptoOn, setCryptoOn] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchAuthed(`/api/tasks/${agreementId}`).catch(() => null);
    if (res?.ok) setLive((await res.json()) as Live);
  }, [agreementId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
    void readCryptoAssets().then((list) => setCryptoOn(list.length > 0)).catch(() => undefined);
  }, [load]);

  // The other side answers in their own browser: look again every 20 seconds until the task is funded.
  useEffect(() => {
    if (live?.status === 'funded') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [live?.status, load]);

  async function answer(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError('');
    const res = await fetchAuthed(`/api/tasks/${agreementId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as Live & { error?: string }) : null;
    setBusy(null);
    if (!res?.ok || !data) {
      setError(data?.error || 'Could not save. Try again.');
      return;
    }
    setCountering(false);
    setLive(data);
  }

  async function payByCard() {
    setBusy('pay');
    setError('');
    const res = await fetchAuthed('/api/billing/task-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agreementId }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { url?: string; error?: string }) : {};
    if (res?.ok && data.url) {
      window.location.assign(data.url);
      return;
    }
    setBusy(null);
    setError(data.error || 'Payment could not start. Try again.');
  }

  const now: Live = live ?? { role: 'buyer', status: (['open', 'countered', 'accepted', 'funded'].includes(status) ? status : 'open') as Live['status'], amount: amount ?? 0 };
  const badge = STATUS[now.status];
  const primary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60';
  const secondary = 'rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-ember disabled:opacity-60';

  return (
    <div className="mx-auto my-4 w-full max-w-md overflow-hidden rounded-3xl border border-line bg-panel shadow-[0_20px_60px_-40px_var(--ember)]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Task</p>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.tone}`}>{badge.label}</span>
      </div>
      <div className="px-5 py-4">
        {title ? <p className="font-serif text-2xl leading-tight text-foreground">{title}</p> : null}
        <p className="mt-2 flex items-baseline gap-2">
          <span className={`font-serif text-3xl ${now.status === 'countered' ? 'text-foreground/50 line-through' : 'text-foreground'}`}>{euros(now.amount)}</span>
          {now.status === 'countered' && now.counterAmount ? <span className="font-serif text-3xl text-foreground">{euros(now.counterAmount)}</span> : null}
        </p>
        {now.status === 'countered' && now.counterNote ? <p className="mt-2 rounded-xl bg-overlay px-3 py-2 text-sm text-foreground">{now.counterNote}</p> : null}

        <div className="mt-4 space-y-2">
          {now.status === 'funded' ? (
            <p className="text-sm text-foreground">Funded. Your project manager and specialist are on it in this chat.</p>
          ) : now.role === 'team' ? (
            now.status === 'open' ? (
              countering ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <label className="sr-only" htmlFor={`counter-${agreementId}`}>Counter amount in euros</label>
                    <input id={`counter-${agreementId}`} value={counterAmount} onChange={(e) => setCounterAmount(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="Amount €" className="w-28 rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:border-ember focus:outline-none" />
                    <label className="sr-only" htmlFor={`note-${agreementId}`}>Why</label>
                    <input id={`note-${agreementId}`} value={counterNote} onChange={(e) => setCounterNote(e.target.value)} maxLength={500} placeholder="Why, in one line" className="min-w-0 flex-1 rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground focus:border-ember focus:outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={Boolean(busy) || !counterAmount} onClick={() => void answer('counter', { amount: counterAmount, note: counterNote })} className={`${primary} flex-1`}>{busy === 'counter' ? 'Sending…' : 'Send counter'}</button>
                    <button type="button" onClick={() => setCountering(false)} className={secondary}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" disabled={Boolean(busy)} onClick={() => void answer('accept')} className={`${primary} flex-1`}>{busy === 'accept' ? 'Accepting…' : `Accept ${euros(now.amount)}`}</button>
                  <button type="button" disabled={Boolean(busy)} onClick={() => setCountering(true)} className={`${secondary} flex-1`}>Counter</button>
                </div>
              )
            ) : (
              <p className="text-sm text-foreground">{now.status === 'countered' ? 'Your counter is with the buyer.' : 'Accepted. Waiting for the buyer to fund it.'}</p>
            )
          ) : now.status === 'open' ? (
            <p className="text-sm text-foreground">Sent to the team. They accept it or counter, right here.</p>
          ) : now.status === 'countered' ? (
            <div className="flex gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => void answer('accept_counter')} className={`${primary} flex-1`}>{busy === 'accept_counter' ? 'Accepting…' : `Accept ${euros(now.counterAmount ?? 0)}`}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => void answer('decline_counter')} className={`${secondary} flex-1`}>Decline</button>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => void payByCard()} disabled={Boolean(busy)} className={`${primary} w-full`}>{busy === 'pay' ? 'Opening payment…' : `Fund ${euros(now.amount)} and start`}</button>
              {cryptoOn ? <button type="button" onClick={() => setCrypto(true)} className="block w-full text-center text-xs font-medium text-foreground underline-offset-2 hover:underline">or pay with crypto</button> : null}
              {crypto ? <CryptoCheckout purpose="agreement" refId={agreementId} title={title || 'Task'} onClose={() => setCrypto(false)} /> : null}
            </>
          )}
          {error ? <p role="alert" className="text-center text-xs text-danger">{error}</p> : null}
        </div>
      </div>
      <p className="border-t border-line px-5 py-2.5 text-center text-xs text-foreground/70">Held by BrandForge, released when you approve the work.</p>
    </div>
  );
}
