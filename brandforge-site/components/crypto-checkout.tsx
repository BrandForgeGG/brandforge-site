'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';

// Pay with crypto: stablecoins or coins, from Trust Wallet or any wallet, checked on-chain. Two calm steps: pick a coin
// (and its network when it has more than one), then pay with one tap. The screen watches the chain and updates by itself.
// Colour has one job each: green for safety and the recommended choice, blue for "watching", the brand orange only for
// the one action that moves things forward, amber for the one caution, red only for real errors.

export type CryptoAsset = { id: string; coin: string; name: string; stable: boolean; chain: string; chainName: string; icon: string; chainIcon: string; feeNote: string; speed: string };
type Invoice = { id: string; asset: CryptoAsset; amount: string; address: string; trustLink: string; uri: string; explorer: string; expiresAt: string; status: string; price: { cents: number; currency: string; rate: number; coinPrice: number | null } };
type Check = { status: string; note: string; done?: string };

let assetsRead: Promise<CryptoAsset[]> | null = null;
export function readCryptoAssets(): Promise<CryptoAsset[]> {
  assetsRead ??= fetch('/api/crypto/config')
    .then((res) => (res.ok ? res.json() : { assets: [] }))
    .then((data: { assets?: CryptoAsset[] }) => data.assets ?? [])
    .catch(() => []);
  return assetsRead;
}
/** Kept for older callers: whether any crypto option is on. */
export const readCryptoNetworks = readCryptoAssets;

// The network each coin opens on: the lowest fee that Trust Wallet users most often hold.
const PREFERRED: Record<string, string> = { USDT: 'usdt-bsc', USDC: 'usdc-base', ETH: 'eth-base' };
const COIN_ORDER = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL', 'TRX', 'LTC'];

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(cents / 100);
}

export function CoinIcon({ icon, chainIcon, size = 32, label }: { icon: string; chainIcon?: string; size?: number; label?: string }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny local SVGs */}
      <img src={`/crypto/${icon}.svg`} alt={label ?? ''} width={size} height={size} className="rounded-full" />
      {chainIcon && chainIcon !== icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny local SVGs
        <img src={`/crypto/${chainIcon}.svg`} alt="" width={size * 0.45} height={size * 0.45} className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-panel" />
      ) : null}
    </span>
  );
}

/** A small overlapping row of the coins we take, for the buttons that open checkout. */
export function CoinStack({ size = 20 }: { size?: number }) {
  return (
    <span className="inline-flex items-center" aria-hidden="true">
      {['usdt', 'usdc', 'btc', 'eth', 'sol'].map((icon, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- tiny local SVGs
        <img key={icon} src={`/crypto/${icon}.svg`} alt="" width={size} height={size} className="rounded-full ring-2 ring-panel" style={{ marginLeft: i ? -size * 0.3 : 0 }} />
      ))}
    </span>
  );
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1600); }, () => undefined)}
      className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${done ? 'border-trust/40 bg-trust/10 text-trust' : 'border-line text-foreground hover:border-foreground/30'}`}
      aria-label={`Copy ${label}`}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Lock() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M12 2 4 5v6.1c0 5 3.4 9.6 8 10.9 4.6-1.3 8-5.9 8-10.9V5l-8-3Zm-1.2 13.6-3.5-3.5 1.4-1.4 2.1 2.1 4.6-4.6 1.4 1.4-6 6Z" />
    </svg>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function CryptoCheckout({ purpose, refId, title, onClose, onPaid }: { purpose: 'plan' | 'agreement' | 'peer' | 'test'; refId: string; title: string; onClose: () => void; onPaid?: (result: Check) => void }) {
  const [assets, setAssets] = useState<CryptoAsset[] | null>(null);
  const [coin, setCoin] = useState<string | null>(null);
  // The option being looked at, and the one the payment was opened for (on Continue).
  const [pending, setPending] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [watching, setWatching] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const paidRef = useRef(false);
  const cursorRef = useRef<number | null>(null);
  const now = useNow(Boolean(invoice) && check?.status !== 'paid');

  useEffect(() => {
    let live = true;
    void readCryptoAssets().then((list) => live && setAssets(list));
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => {
      live = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const coins = useMemo(() => {
    const by = new Map<string, CryptoAsset[]>();
    for (const asset of assets ?? []) by.set(asset.coin, [...(by.get(asset.coin) ?? []), asset]);
    return COIN_ORDER.filter((c) => by.has(c)).map((c) => ({ coin: c, options: by.get(c) as CryptoAsset[] }));
  }, [assets]);
  const stableCoins = coins.filter((c) => c.options[0].stable);
  const otherCoins = coins.filter((c) => !c.options[0].stable);
  // The lowest-fee network first, then the rest as they come.
  const networks = [...(coins.find((c) => c.coin === coin)?.options ?? [])].sort((a, b) => Number(b.id === PREFERRED[b.coin]) - Number(a.id === PREFERRED[a.coin]));

  function pickCoin(next: string) {
    const options = coins.find((c) => c.coin === next)?.options ?? [];
    setCoin(next);
    setPending(options.find((o) => o.id === PREFERRED[next])?.id ?? options[0]?.id ?? null);
  }

  // A fresh (or reopened) payment for the chosen coin and network.
  useEffect(() => {
    if (!assetId) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the payment follows the chosen coin
    setBusy(true);
    setError(null);
    setInvoice(null);
    setQr(null);
    setCheck(null);
    void fetchAuthed('/api/crypto/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose, refId, network: assetId }) })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { invoice?: Invoice; error?: string };
        if (!live) return;
        if (!res.ok || !data.invoice) throw new Error(data.error || 'The payment could not be started.');
        setInvoice(data.invoice);
        trackEvent('plan_interest', { source: `crypto-${purpose}-${assetId}` });
      })
      .catch((cause) => live && setError(cause instanceof Error ? cause.message : 'The payment could not be started.'))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [assetId, purpose, refId]);

  // The QR code opens Trust Wallet on a phone, already filled in.
  useEffect(() => {
    if (!invoice) return;
    let live = true;
    void import('qrcode').then((QR) => QR.toDataURL(invoice.trustLink, { margin: 1, width: 280, errorCorrectionLevel: 'M' })).then((url) => live && setQr(url), () => undefined);
    return () => {
      live = false;
    };
  }, [invoice]);

  function settle(data: Check) {
    setCheck(data);
    if (data.status === 'paid' && !paidRef.current) {
      paidRef.current = true;
      onPaid?.(data);
    }
  }

  // Watch the chain for this payment's exact amount every 10 seconds while the checkout is open.
  useEffect(() => {
    if (!invoice || paidRef.current) return;
    cursorRef.current = null;
    let live = true;
    let timer = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the watcher follows the payment
    setWatching(true);
    const look = async () => {
      if (!live || paidRef.current || Date.now() > Date.parse(invoice.expiresAt) + 3_600_000) return;
      try {
        const res = await fetchAuthed(`/api/crypto/invoice/${invoice.id}?watch=1${cursorRef.current ? `&cursor=${cursorRef.current}` : ''}`);
        const data = (await res.json().catch(() => ({}))) as Check & { cursor?: number | null };
        if (!live) return;
        if (typeof data.cursor === 'number') cursorRef.current = data.cursor;
        if (data.status && data.status !== 'waiting') {
          settle(data);
          if (data.status === 'paid') return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one watcher per payment
  }, [invoice]);

  async function runCheck(value = hash) {
    if (!invoice || !value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchAuthed(`/api/crypto/invoice/${invoice.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: value.trim() }) });
      const data = (await res.json().catch(() => ({}))) as Check & { error?: string };
      if (!res.ok) throw new Error(data.error || 'The payment could not be checked.');
      settle(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The payment could not be checked.');
    } finally {
      setBusy(false);
    }
  }

  const paid = check?.status === 'paid';
  const stage = paid ? 3 : check?.status === 'confirming' ? 2 : 1;
  const left = invoice ? Math.max(0, Date.parse(invoice.expiresAt) - now) : 0;
  const clock = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  const problem = check && !['confirming', 'paid', 'waiting', 'missing'].includes(check.status);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Pay for ${title} with crypto`}
        onClick={(event) => event.stopPropagation()}
        className="bf-rise max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-panel shadow-[var(--shadow-soft)] outline-none sm:max-w-[440px] sm:rounded-3xl"
      >
        {/* Header: what is being paid for, and the reassurance that matters most. */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-trust">
              <Lock /> Secure crypto checkout
            </p>
            <h2 className="mt-1 truncate font-serif text-xl text-foreground">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="-mr-1 rounded-lg px-2 py-1 text-lg leading-none text-muted hover:text-foreground" aria-label="Close">
            ×
          </button>
        </div>

        {paid ? (
          <div className="px-5 pb-6 pt-6 text-center">
            <span className="bf-pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-trust text-white">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <p className="mt-4 font-serif text-2xl text-foreground">You are all set</p>
            <p className="mt-1 text-sm text-muted">{check?.note}</p>
            {check?.done ? <p className="mt-1 text-sm text-foreground">Paid through {new Date(check.done).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.</p> : null}
            <p className="mt-1 text-xs text-muted">A receipt is on its way to your email.</p>
            <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-on-ember transition hover:opacity-90">
              Done
            </button>
          </div>
        ) : !invoice ? (
          // Step 1: choose how to pay.
          <div className="px-5 pb-5 pt-4">
            {assets === null ? <div className="bf-skeleton h-40 rounded-2xl bg-overlay" aria-hidden="true" /> : null}
            {assets && assets.length === 0 ? <p className="text-sm text-muted">Crypto payments are not switched on yet.</p> : null}
            {stableCoins.length ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Stablecoins</p>
                  <span className="rounded-full bg-trust/10 px-2 py-0.5 text-[11px] font-semibold text-trust">Recommended · 1 coin = 1 dollar</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {stableCoins.map(({ coin: c, options }) => (
                    <button key={c} type="button" onClick={() => pickCoin(c)} aria-pressed={coin === c} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${coin === c ? 'border-trust bg-trust/5 ring-1 ring-trust' : 'border-line hover:border-foreground/25 hover:bg-overlay'}`}>
                      <CoinIcon icon={options[0].icon} size={36} label={c} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{c}</span>
                        <span className="block truncate text-xs text-muted">{options.length} networks</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {otherCoins.length ? (
              <>
                <p className="mt-4 text-sm font-medium text-foreground">Crypto</p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-3">
                  {otherCoins.map(({ coin: c, options }) => (
                    <button key={c} type="button" onClick={() => pickCoin(c)} aria-pressed={coin === c} className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 transition ${coin === c ? 'border-ember bg-ember/5 ring-1 ring-ember' : 'border-line hover:border-foreground/25 hover:bg-overlay'}`}>
                      <CoinIcon icon={options[0].icon} size={30} label={c} />
                      <span className="text-xs font-semibold text-foreground">{c}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Coins are priced live and the price is held for 30 minutes.</p>
              </>
            ) : null}
            {networks.length > 1 ? (
              <div className="mt-4">
                <p className="text-sm font-medium text-foreground">Network</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Network">
                  {networks.map((option) => (
                    <button key={option.id} type="button" onClick={() => setPending(option.id)} aria-pressed={pending === option.id} className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs transition ${pending === option.id ? 'border-foreground bg-foreground text-background' : 'border-line text-foreground hover:border-foreground/30'}`}>
                      <CoinIcon icon={option.chainIcon} size={20} />
                      {option.chainName}
                      {option.id === PREFERRED[option.coin] ? <span className={pending === option.id ? 'text-background/70' : 'text-trust'}>· lowest fee</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {pending ? (
              <button type="button" disabled={busy} onClick={() => setAssetId(pending)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-ember px-4 py-3.5 text-[15px] font-semibold text-on-ember shadow-[0_8px_20px_-8px_var(--ember)] transition hover:-translate-y-px hover:opacity-95 disabled:opacity-70">
                {busy ? 'Preparing your payment…' : `Continue with ${coins.find((c) => c.coin === coin)?.options.find((o) => o.id === pending)?.coin ?? ''}${networks.length > 1 ? ` on ${networks.find((o) => o.id === pending)?.chainName ?? ''}` : ''}`}
              </button>
            ) : null}
            <p className="mt-5 flex items-start gap-2 rounded-xl bg-trust/5 p-3 text-xs text-foreground">
              <span className="mt-0.5 text-trust"><Shield /></span>
              <span>Your payment goes straight to BrandForge’s wallet and is confirmed on-chain. No card, no bank details, no sign-up with a payment company.</span>
            </p>
          </div>
        ) : (
          // Step 2: pay.
          <div className="px-5 pb-5 pt-4">
            <div className="rounded-2xl border border-line bg-background p-4">
              <div className="flex items-center gap-3">
                <CoinIcon icon={invoice.asset.icon} chainIcon={invoice.asset.chainIcon} size={40} label={invoice.asset.coin} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">Send exactly</p>
                  <p className="truncate font-serif text-[28px] leading-tight text-foreground">
                    {invoice.amount} <span className="text-base font-sans font-semibold">{invoice.asset.coin}</span>
                  </p>
                </div>
                <Copy text={invoice.amount} label="amount" />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {money(invoice.price.cents, invoice.price.currency)} on {invoice.asset.chainName}
                  {invoice.price.coinPrice ? ` · 1 ${invoice.asset.coin} = $${invoice.price.coinPrice.toLocaleString('en', { maximumFractionDigits: invoice.price.coinPrice < 1 ? 4 : 2 })}` : ''}
                </span>
                {left > 0 ? <span className="rounded-full bg-overlay px-2 py-0.5 font-medium tabular-nums text-foreground">Price held {clock}</span> : null}
              </div>
            </div>

            <a href={invoice.trustLink} onClick={() => trackEvent('plan_interest', { source: `crypto-open-trust-${invoice.asset.id}` })} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ember px-4 py-3.5 text-[15px] font-semibold text-on-ember shadow-[0_8px_20px_-8px_var(--ember)] transition hover:-translate-y-px hover:opacity-95">
              <Shield /> Pay with Trust Wallet
            </a>
            <p className="mt-1.5 text-center text-xs text-muted">Opens Trust Wallet with the amount and address filled in.</p>

            {/* Live status: where the payment is, in three steps. */}
            <ol className="mt-5 grid grid-cols-3 gap-1.5" aria-label="Payment status">
              {[
                ['Sent', stage === 1 ? 'Watching…' : 'Found'],
                ['Confirming', stage === 2 ? 'On its way' : stage > 2 ? 'Done' : 'Next'],
                ['Done', stage === 3 ? 'Paid' : 'Last'],
              ].map(([label, sub], i) => {
                const n = i + 1;
                const active = stage === n;
                const done = stage > n;
                return (
                  <li key={label} className={`rounded-xl border px-2.5 py-2 ${active ? 'border-distribute/40 bg-distribute/5' : done ? 'border-trust/30 bg-trust/5' : 'border-line'}`}>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <span className={`h-2 w-2 rounded-full ${active ? 'animate-pulse bg-distribute' : done ? 'bg-trust' : 'bg-line'}`} aria-hidden="true" />
                      {label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">{sub}</p>
                  </li>
                );
              })}
            </ol>
            <p className={`mt-2 text-xs ${problem ? 'text-danger' : 'text-muted'}`} aria-live="polite">
              {check && check.status !== 'missing' ? check.note : watching ? 'This screen updates by itself when your payment arrives.' : ''}
            </p>

            <details className="group mt-4 rounded-2xl border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm text-foreground">
                Pay from a computer or another wallet
                <span className="text-muted transition group-open:rotate-180" aria-hidden="true">▾</span>
              </summary>
              <div className="border-t border-line px-4 pb-4 pt-3">
                <div className="flex items-start gap-4">
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element -- generated QR data URL
                    <img src={qr} alt="QR code that opens Trust Wallet with this payment filled in" width={124} height={124} className="h-[124px] w-[124px] shrink-0 rounded-xl bg-white p-1" />
                  ) : (
                    <div className="h-[124px] w-[124px] shrink-0 rounded-xl bg-overlay" aria-hidden="true" />
                  )}
                  <p className="text-xs text-muted">Scan with your phone’s camera to open Trust Wallet with everything filled in. {invoice.asset.feeNote} {invoice.asset.speed} to confirm.</p>
                </div>
                <p className="mt-3 text-xs text-muted">Address on {invoice.asset.chainName}</p>
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-background px-3 py-2">
                  <span className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">{invoice.address}</span>
                  <Copy text={invoice.address} label="address" />
                </div>
                <p className="mt-2 rounded-lg bg-copper/10 px-2.5 py-1.5 text-xs text-foreground">
                  Send only {invoice.asset.coin} on {invoice.asset.chainName}. Other coins or networks cannot be recovered.
                </p>
              </div>
            </details>

            <details className="mt-2 rounded-2xl border border-line" open={hash ? true : undefined}>
              <summary className="cursor-pointer list-none px-4 py-3 text-sm text-foreground">Already paid? Paste the transaction ID</summary>
              <div className="border-t border-line px-4 pb-4 pt-3">
                <p className="text-xs text-muted">In Trust Wallet, open the transfer in your history and copy its transaction ID.</p>
                <div className="mt-2 flex gap-2">
                  <input
                    id="crypto-tx"
                    value={hash}
                    onChange={(event) => setHash(event.target.value)}
                    onPaste={(event) => {
                      const text = event.clipboardData.getData('text');
                      if (text) window.setTimeout(() => void runCheck(text), 50);
                    }}
                    aria-label="Transaction ID"
                    placeholder="Transaction ID"
                    className="min-w-0 flex-1 rounded-xl border border-line bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-foreground/40"
                  />
                  <button type="button" onClick={() => void runCheck()} disabled={busy || !hash.trim()} className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm text-foreground transition hover:border-foreground/30 disabled:opacity-50">
                    {busy ? 'Checking…' : 'Check'}
                  </button>
                </div>
              </div>
            </details>

            <button type="button" onClick={() => { setInvoice(null); setAssetId(null); }} className="mt-4 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">
              Pay with another coin
            </button>
          </div>
        )}
        {error ? <p role="alert" className="px-5 pb-5 text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
