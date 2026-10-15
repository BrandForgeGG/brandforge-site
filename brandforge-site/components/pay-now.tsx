'use client';

import { useEffect, useState } from 'react';
import { fetchAuthed, getSessionUser } from '@/lib/browser-auth';
import { CoinStack, CryptoCheckout } from '@/components/crypto-checkout';
import { trackEvent } from '@/lib/funnel-client';
import { useLogin } from '@/components/login-dialog';

type Status = { open: boolean; card: boolean; crypto: boolean };
let statusRead: Promise<Status> | null = null;
function readStatus(): Promise<Status> {
  statusRead ??= fetch('/api/billing/config')
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => ({ open: Boolean(data?.open), card: Boolean(data?.card), crypto: Boolean(data?.crypto) }))
    .catch(() => ({ open: false, card: false, crypto: false }));
  return statusRead;
}

// "Pay now" for a monthly plan: by card when Stripe is connected, with crypto (stablecoins from Trust Wallet or any wallet,
// 30 days per payment) when a receiving address is set. With neither it shows locked, says why in one line, and lets the
// person say they want it (recorded as interest; nothing is charged or collected).
export function PayNow({ planId, planName, primary = false }: { planId: string; planName: string; primary?: boolean }) {
  const { openLogin } = useLogin();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noted, setNoted] = useState(false);
  const [crypto, setCrypto] = useState(false);

  async function payCrypto() {
    if (!(await getSessionUser().catch(() => null))) {
      openLogin({ reason: 'signin', next: '/pricing' });
      return;
    }
    trackEvent('plan_interest', { source: `crypto-${planId}` });
    setCrypto(true);
  }

  useEffect(() => {
    let live = true;
    void readStatus().then((value) => live && setStatus(value));
    return () => {
      live = false;
    };
  }, []);

  async function pay() {
    setBusy(true);
    setError(null);
    trackEvent('plan_interest', { source: `pay-${planId}` });
    try {
      const response = await fetchAuthed('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: planId }) });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (response.status === 401) {
        openLogin({ reason: 'signin', next: '/pricing' });
        return;
      }
      if (!response.ok || !data.url) {
        setError(data.error || 'Payment could not start. Try again in a moment.');
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError('Connection problem. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const base = 'w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition';
  if (!status) return <div className={`${base} bf-skeleton h-10 bg-overlay`} aria-hidden="true" />;

  if (status.open) {
    return (
      <div className="space-y-1.5">
        {status.card ? (
          <button type="button" onClick={() => void pay()} disabled={busy} className={`${base} ${primary ? 'bg-ember text-on-ember hover:opacity-90' : 'border border-line text-foreground hover:border-ember'} disabled:opacity-60`}>
            {busy ? 'Opening payment…' : `Pay by card · ${planName}`}
          </button>
        ) : null}
        {status.crypto ? (
          <button type="button" onClick={() => void payCrypto()} className={`${base} flex items-center justify-center gap-2 ${primary && !status.card ? 'bg-ember text-on-ember shadow-[0_8px_20px_-10px_var(--ember)] hover:-translate-y-px hover:opacity-95' : 'border border-line text-foreground hover:border-ember'}`}>
            <CoinStack size={18} />
            Get {planName} with crypto
          </button>
        ) : null}
        {status.crypto ? <p className="text-center text-[11px] leading-snug text-muted">USDT, USDC, BTC, ETH, SOL and more, from Trust Wallet. Each payment adds 30 days.</p> : null}
        {error ? <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p> : null}
        {crypto ? <CryptoCheckout purpose="plan" refId={planId} title={`${planName}, 30 days`} onClose={() => setCrypto(false)} onPaid={() => { statusRead = null; }} /> : null}
      </div>
    );
  }

  return (
    <div>
      <button type="button" disabled aria-describedby={`pay-${planId}-note`} className={`${base} flex cursor-not-allowed items-center justify-center gap-2 border border-dashed border-line text-muted`}>
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="4" y="9" width="12" height="8" rx="2" />
          <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
        </svg>
        Pay now opens soon
      </button>
      <p id={`pay-${planId}-note`} className="mt-1.5 text-center text-[11px] leading-snug text-muted">
        {noted ? (
          <span className="text-success">Noted, thank you. To start today, ask for the plan in the chat.</span>
        ) : (
          <>
            Card and crypto payments are being connected.{' '}
            <button
              type="button"
              onClick={() => {
                trackEvent('plan_interest', { source: `notify-${planId}` });
                setNoted(true);
              }}
              className="text-ember underline-offset-2 hover:underline"
            >
              Tell me when
            </button>
          </>
        )}
      </p>
    </div>
  );
}
