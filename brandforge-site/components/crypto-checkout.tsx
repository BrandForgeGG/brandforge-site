'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';

// Pay with crypto: stablecoins from Trust Wallet (or any wallet), checked on-chain. The member picks a network, sees the
// exact amount and our address (with a QR code and a button that opens Trust Wallet already filled in), sends it, and
// pastes the transaction ID. We read it on its chain and, once it is confirmed, the plan, the escrow or the contract
// moves on by itself.

type Network = { id: string; label: string; short: string; symbol: string; feeNote: string };
type Invoice = { id: string; network: string; networkLabel: string; symbol: string; amount: string; address: string; trustLink: string; uri: string; feeNote: string; explorer: string; expiresAt: string; status: string; price: { cents: number; currency: string; rate: number } };
type Check = { status: string; note: string; done?: string };

let networksRead: Promise<Network[]> | null = null;
export function readCryptoNetworks(): Promise<Network[]> {
  networksRead ??= fetch('/api/crypto/config')
    .then((res) => (res.ok ? res.json() : { networks: [] }))
    .then((data: { networks?: Network[] }) => data.networks ?? [])
    .catch(() => []);
  return networksRead;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(cents / 100);
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1600); }, () => undefined)}
      className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs text-foreground transition hover:border-ember"
      aria-label={`Copy ${label}`}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export function CryptoCheckout({ purpose, refId, title, onClose, onPaid }: { purpose: 'plan' | 'agreement' | 'peer' | 'test'; refId: string; title: string; onClose: () => void; onPaid?: (result: Check) => void }) {
  const [networks, setNetworks] = useState<Network[] | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const paidRef = useRef(false);

  useEffect(() => {
    let live = true;
    void readCryptoNetworks().then((list) => {
      if (!live) return;
      setNetworks(list);
      if (list.length === 1) setNetwork(list[0].id);
    });
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => {
      live = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // A fresh invoice for the chosen network.
  useEffect(() => {
    if (!network) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the invoice follows the chosen network
    setBusy(true);
    setError(null);
    setInvoice(null);
    setCheck(null);
    void fetchAuthed('/api/crypto/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose, refId, network }) })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { invoice?: Invoice; error?: string };
        if (!live) return;
        if (!res.ok || !data.invoice) throw new Error(data.error || 'The payment could not be started.');
        setInvoice(data.invoice);
        trackEvent('plan_interest', { source: `crypto-${purpose}-${network}` });
      })
      .catch((cause) => live && setError(cause instanceof Error ? cause.message : 'The payment could not be started.'))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [network, purpose, refId]);

  // The QR code opens Trust Wallet on a phone, already filled in.
  useEffect(() => {
    if (!invoice) return;
    let live = true;
    void import('qrcode').then((QR) => QR.toDataURL(invoice.trustLink, { margin: 1, width: 240, errorCorrectionLevel: 'M' })).then((url) => live && setQr(url), () => undefined);
    return () => {
      live = false;
    };
  }, [invoice]);

  async function runCheck(value = hash) {
    if (!invoice || !value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchAuthed(`/api/crypto/invoice/${invoice.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: value.trim() }) });
      const data = (await res.json().catch(() => ({}))) as Check & { error?: string };
      if (!res.ok) throw new Error(data.error || 'The payment could not be checked.');
      setCheck(data);
      if (data.status === 'paid' && !paidRef.current) {
        paidRef.current = true;
        onPaid?.(data);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The payment could not be checked.');
    } finally {
      setBusy(false);
    }
  }

  // Watch for the payment while this is open: the server looks on-chain for this invoice's exact amount every 10
  // seconds, so most people never need to paste anything. It stops once paid or an hour after the invoice expires.
  const cursorRef = useRef<number | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  useEffect(() => {
    if (!invoice || paidRef.current) return;
    cursorRef.current = null;
    let live = true;
    let timer = 0;
    const look = async () => {
      if (!live || paidRef.current || Date.now() > Date.parse(invoice.expiresAt) + 3_600_000) return;
      try {
        const res = await fetchAuthed(`/api/crypto/invoice/${invoice.id}?watch=1${cursorRef.current ? `&cursor=${cursorRef.current}` : ''}`);
        const data = (await res.json().catch(() => ({}))) as Check & { cursor?: number | null };
        if (!live) return;
        if (typeof data.cursor === 'number') cursorRef.current = data.cursor;
        if (data.status === 'waiting') setWatching(data.note);
        else if (data.status) {
          setWatching(null);
          setCheck(data);
          if (data.status === 'paid') {
            paidRef.current = true;
            onPaid?.(data);
            return;
          }
        }
      } catch {
        /* the next look tries again */
      }
      if (live) timer = window.setTimeout(() => void look(), 10_000);
    };
    timer = window.setTimeout(() => void look(), 4000);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one watcher per invoice
  }, [invoice]);

  // While the network confirms a pasted transaction, check again on its own every few seconds.
  useEffect(() => {
    if (check?.status !== 'confirming') return;
    const timer = window.setTimeout(() => void runCheck(), 8000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when a new "confirming" answer arrives
  }, [check]);

  const paid = check?.status === 'paid';
  // "USDT on BNB Smart Chain" -> "BNB Smart Chain", for sentences that already name the coin.
  const chain = invoice ? invoice.networkLabel.replace(/^\S+ on /, '') : '';
  const chip = 'rounded-full border px-3 py-1.5 text-xs transition';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Pay for ${title} with crypto`}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-panel p-5 shadow-[var(--shadow-soft)] outline-none sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Pay with crypto</p>
            <h2 className="mt-0.5 font-serif text-xl text-foreground">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-muted hover:text-foreground" aria-label="Close">✕</button>
        </div>

        {paid ? (
          <div className="mt-6 rounded-2xl border border-success/30 bg-success/10 p-4">
            <p className="text-sm font-semibold text-foreground">{check?.note}</p>
            {check?.done ? <p className="mt-1 text-xs text-muted">Paid through {new Date(check.done).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.</p> : null}
            <button type="button" onClick={onClose} className="mt-3 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-on-ember">Done</button>
          </div>
        ) : (
          <>
            {networks === null ? <p className="mt-5 text-sm text-muted">Loading…</p> : null}
            {networks && networks.length === 0 ? <p className="mt-5 text-sm text-muted">Crypto payments are not switched on yet.</p> : null}
            {networks && networks.length > 1 ? (
              <div className="mt-4">
                <p className="text-sm text-foreground">Pay with</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Network">
                  {networks.map((option) => (
                    <button key={option.id} type="button" aria-pressed={network === option.id} disabled={busy} onClick={() => setNetwork(option.id)} className={`${chip} ${network === option.id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                      {option.short}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {busy && !invoice ? <p className="mt-5 text-sm text-muted" aria-live="polite">Preparing your payment…</p> : null}

            {invoice ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-line bg-background p-4">
                  <p className="text-xs text-muted">Send exactly</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="font-serif text-3xl text-foreground">
                      {invoice.amount} <span className="text-lg">{invoice.symbol}</span>
                    </p>
                    <Copy text={invoice.amount} label="amount" />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {money(invoice.price.cents, invoice.price.currency)}
                    {invoice.price.currency !== 'USD' ? ` at today’s rate (1 ${invoice.price.currency} = ${invoice.price.rate.toFixed(4)} USD)` : ''}, on {chain}. The last digits mark this payment as yours.
                  </p>
                </div>

                <a href={invoice.trustLink} className="flex w-full items-center justify-center gap-2 rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-on-ember transition hover:opacity-90">
                  Pay with Trust Wallet
                </a>

                <div className="flex items-center gap-4">
                  {qr ? <img src={qr} alt="QR code that opens Trust Wallet with this payment filled in" width={120} height={120} className="h-[120px] w-[120px] shrink-0 rounded-xl bg-white p-1" /> : <div className="h-[120px] w-[120px] shrink-0 rounded-xl bg-overlay" aria-hidden="true" />}
                  <div className="min-w-0 text-xs text-muted">
                    <p>On a computer: scan this with your phone’s camera to open Trust Wallet with the payment filled in.</p>
                    <p className="mt-1.5">{invoice.feeNote}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted">Or send it from any wallet to this {chain} address</p>
                  <div className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-background px-3 py-2">
                    <span className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">{invoice.address}</span>
                    <Copy text={invoice.address} label="address" />
                  </div>
                  <p className="mt-1 text-xs text-danger">Send only {invoice.symbol} on {chain}. Other coins or networks cannot be recovered.</p>
                </div>

                <div className="border-t border-line pt-4">
                  {!check || check.status === 'missing' ? (
                    <p className="flex items-center gap-2 text-sm text-foreground" aria-live="polite">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-ember" aria-hidden="true" />
                      {watching ?? 'Watching for your payment. This screen updates by itself when it arrives.'}
                    </p>
                  ) : (
                    <p className={`text-sm ${check.status === 'confirming' ? 'text-foreground' : 'text-danger'}`} aria-live="polite">
                      {check.status === 'confirming' ? <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-ember align-middle" aria-hidden="true" /> : null}
                      {check.note}
                    </p>
                  )}
                  <details className="mt-3" open={hash ? true : undefined}>
                  <summary className="cursor-pointer text-xs text-muted hover:text-foreground">Paid a different amount, or it is taking long? Paste the transaction ID</summary>
                  <p className="mt-2 text-xs text-muted">In Trust Wallet: open the transfer in your history, then copy its transaction hash.</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="crypto-tx"
                      value={hash}
                      onChange={(event) => setHash(event.target.value)}
                      onPaste={(event) => {
                        const text = event.clipboardData.getData('text');
                        if (text) window.setTimeout(() => void runCheck(text), 50);
                      }}
                      placeholder={invoice.network === 'tron-usdt' ? '64 letters and numbers' : '0x…'}
                      className="min-w-0 flex-1 rounded-xl border border-line bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-ember"
                    />
                    <button type="button" onClick={() => void runCheck()} disabled={busy || !hash.trim()} className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50">
                      {busy ? 'Checking…' : 'Check'}
                    </button>
                  </div>
                  </details>
                </div>
                <p className="text-xs text-muted">This amount holds until {new Date(invoice.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. A payment sent later still counts if it matches.</p>
              </div>
            ) : null}
          </>
        )}
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
