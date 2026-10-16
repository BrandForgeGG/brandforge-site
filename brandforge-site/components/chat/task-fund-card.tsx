'use client';

import { useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import { CryptoCheckout, readCryptoAssets } from '@/components/crypto-checkout';

// A custom task the buyer set up with its funds. The buyer funds it here, by card or crypto; BrandForge holds the money and
// releases it when the buyer approves the work. Funding puts the founder on the project as its dedicated project manager.
export function TaskFundCard({ agreementId, status, title, amount, canPay }: { agreementId: string; status: string; title?: string; amount?: number; canPay: boolean }) {
  const funded = status === 'funded';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [crypto, setCrypto] = useState(false);
  const [cryptoOn, setCryptoOn] = useState(false);
  useEffect(() => {
    let live = true;
    void readCryptoAssets().then((list) => live && setCryptoOn(list.length > 0)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function payByCard() {
    setBusy(true);
    setError('');
    const res = await fetchAuthed('/api/billing/task-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agreementId }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { url?: string; error?: string }) : {};
    if (res?.ok && data.url) {
      window.location.assign(data.url);
      return;
    }
    setBusy(false);
    setError(data.error || 'Payment could not start. Try again.');
  }

  return (
    <div className="mx-auto my-4 w-full max-w-md rounded-3xl border border-ember/40 bg-panel p-5 shadow-[0_20px_60px_-40px_var(--ember)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Task</p>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${funded ? 'bg-trust/15 text-success' : 'bg-ember/15 text-ember'}`}>{funded ? 'Funded' : 'Waiting for funds'}</span>
      </div>
      {title ? <p className="mt-2 font-serif text-2xl text-foreground">{title}</p> : null}
      {amount ? <p className="mt-1 font-serif text-3xl text-foreground">€{amount.toLocaleString('en-US')}</p> : null}
      {funded ? (
        <p className="mt-4 text-sm text-foreground">Funded. Your project manager and specialist are on it in this chat.</p>
      ) : canPay ? (
        <div className="mt-5 space-y-2">
          <button type="button" onClick={() => void payByCard()} disabled={busy} className="w-full rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60">
            {busy ? 'Opening payment…' : `Fund €${(amount ?? 0).toLocaleString('en-US')} and start`}
          </button>
          {cryptoOn ? (
            <button type="button" onClick={() => setCrypto(true)} className="block w-full text-center text-xs font-medium text-foreground underline-offset-2 hover:underline">
              or pay with crypto
            </button>
          ) : null}
          <p className="pt-1 text-center text-xs text-foreground/70">Held by BrandForge, released when you approve the work.</p>
          {error ? <p role="alert" className="text-center text-xs text-danger">{error}</p> : null}
          {crypto ? <CryptoCheckout purpose="agreement" refId={agreementId} title={title || 'Task'} onClose={() => setCrypto(false)} /> : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-foreground/70">Waiting for the buyer to fund it.</p>
      )}
    </div>
  );
}
