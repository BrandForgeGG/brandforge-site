import { randomInt } from 'node:crypto';
import { addressFor, amountFor, assetOf, chainOf, enabledAssets, judgePayment, normalizeTxHash, paymentUri, publicAsset, toUnits, trustLink, type Asset, type AssetId, type PaymentStatus, type PublicAsset } from '@/lib/crypto-chains.js';
import { findPayment, readChainTx } from '@/lib/crypto-verify';
import { getPaidPlan } from '@/lib/plans.js';
import { canSubmitFunding } from '@/lib/money-authz.js';
import { applyAction } from '@/lib/peer-contract.js';
import {
  claimCryptoInvoice,
  createCryptoInvoice,
  findOpenCryptoInvoice,
  cryptoTxUsed,
  extendCryptoPlan,
  getAgreementById,
  getConversationOwnerId,
  getPeerContract,
  isStaffAccount,
  peerRowToContract,
  recordFunnelEvent,
  savePeerContract,
  submitAgreementFunding,
  type CryptoInvoiceRow,
} from '@/lib/project-db';
import { completeAgreementFunding } from '@/lib/funding-complete';
import { announce } from '@/lib/peer-contract-service';
import { postOpsEvent } from '@/lib/ops-events';
import { sendStageEmail } from '@/lib/email';

// Crypto checkout, the server part. A payment is priced here from the record it pays for (never from what the browser
// says), converted to dollars at today's ECB rate, and given a small tag so it can be told apart. Once the member sends
// it, the transaction is read on its own chain and, when it pays in full and is confirmed, the plan, the escrow or the
// contract moves on by itself: no one has to check by hand.

export type Purpose = 'plan' | 'agreement' | 'peer' | 'test';
// Stablecoin amounts hold for an hour; coins that move hold their price for 30 minutes.
const INVOICE_MINUTES = 60;
const VOLATILE_MINUTES = 30;

const coinPrices = new Map<string, { at: number; usd: number }>();

/** Dollars per coin right now: CoinGecko, with Binance as a backup; kept for a minute. */
export async function coinPrice(asset: Asset): Promise<number> {
  if (asset.stable || !asset.coingecko) return 1;
  const hit = coinPrices.get(asset.coingecko);
  if (hit && Date.now() - hit.at < 60_000) return hit.usd;
  let usd = NaN;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${asset.coingecko}&vs_currencies=usd`, { signal: AbortSignal.timeout(5000) });
    const data = (await res.json().catch(() => null)) as Record<string, { usd?: number }> | null;
    usd = Number(data?.[asset.coingecko]?.usd);
  } catch {
    /* falls back to Binance */
  }
  if (!Number.isFinite(usd) || usd <= 0) {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${asset.binance}`, { signal: AbortSignal.timeout(5000) });
    const data = (await res.json().catch(() => null)) as { price?: string } | null;
    usd = Number(data?.price);
  }
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('price unavailable');
  coinPrices.set(asset.coingecko, { at: Date.now(), usd });
  return usd;
}

const rates = new Map<string, { at: number; rate: number }>();

/** Dollars per one unit of a currency (ECB reference rate via frankfurter.dev, kept for six hours). */
export async function usdRate(currency: string): Promise<number> {
  const code = currency.toUpperCase();
  if (code === 'USD' || code === 'USDT' || code === 'USDC') return 1;
  const hit = rates.get(code);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.rate;
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(code)}&symbols=USD`, { signal: AbortSignal.timeout(6000) });
  const data = (await res.json().catch(() => null)) as { rates?: { USD?: number } } | null;
  const rate = Number(data?.rates?.USD);
  if (!res.ok || !Number.isFinite(rate) || rate <= 0) throw new Error('rate unavailable');
  rates.set(code, { at: Date.now(), rate });
  return rate;
}

type Priced = { ok: true; cents: number; currency: string; title: string } | { ok: false; status: number; error: string };

/** What this person owes for a thing, from its own record, or why they cannot pay for it. */
export async function priceFor(purpose: Purpose, refId: string, userId: string): Promise<Priced> {
  if (purpose === 'test') {
    // Staff only: one dollar through the whole checkout, nothing bought.
    if (!(await isStaffAccount(userId))) return { ok: false, status: 403, error: 'Only BrandForge staff can run a test payment.' };
    return { ok: true, cents: 100, currency: 'USD', title: 'Test payment, 1 dollar' };
  }
  if (purpose === 'plan') {
    const plan = getPaidPlan(refId);
    if (!plan || !plan.cents) return { ok: false, status: 400, error: 'That plan cannot be paid for.' };
    return { ok: true, cents: plan.cents, currency: 'EUR', title: `${plan.name} plan, 30 days` };
  }
  if (purpose === 'agreement') {
    const agreement = await getAgreementById(refId);
    if (!agreement) return { ok: false, status: 404, error: 'That agreement was not found.' };
    const ownerId = await getConversationOwnerId(agreement.conversation_id);
    const decision = canSubmitFunding({ actor: { userId, isStaff: await isStaffAccount(userId) }, ownerId });
    if (!decision.allowed) return { ok: false, status: decision.status, error: decision.reason };
    if (agreement.status !== 'pending_funding') return { ok: false, status: 409, error: 'This agreement is not waiting for payment.' };
    return { ok: true, cents: Math.round(Number(agreement.total_amount) * 100), currency: String(agreement.currency || 'EUR'), title: 'Project escrow' };
  }
  const found = await getPeerContract(refId);
  if (!found.ok) return { ok: false, status: 404, error: 'That contract was not found.' };
  const contract = peerRowToContract(found.row);
  if (contract.payerId !== userId) return { ok: false, status: 403, error: 'Only the person paying can fund this contract.' };
  if (contract.status !== 'active') return { ok: false, status: 409, error: 'Both people must sign before funding.' };
  if (contract.fundingStatus === 'funded') return { ok: false, status: 409, error: 'This contract is already funded.' };
  return { ok: true, cents: contract.totalCents, currency: contract.currency, title: contract.title || 'Contract' };
}

export type InvoiceView = {
  id: string;
  asset: PublicAsset;
  amount: string;
  address: string;
  trustLink: string;
  uri: string;
  explorer: string;
  expiresAt: string;
  status: CryptoInvoiceRow['status'];
  price: { cents: number; currency: string; rate: number; coinPrice: number | null };
};

export function invoiceView(row: CryptoInvoiceRow): InvoiceView {
  const asset = assetOf(row.network) as Asset;
  const chain = chainOf(asset)!;
  return {
    id: row.id,
    asset: publicAsset(asset.id),
    amount: row.amount,
    address: row.address,
    trustLink: trustLink(asset.id, row.address, row.amount),
    uri: paymentUri(asset.id, row.address, row.amount),
    explorer: chain.explorer,
    expiresAt: row.expires_at,
    status: row.status,
    price: { cents: row.price_cents, currency: row.currency, rate: Number(row.rate), coinPrice: row.coin_price ? Number(row.coin_price) : null },
  };
}

export function cryptoAssets(): AssetId[] {
  return enabledAssets(process.env as Record<string, string | undefined>);
}

/** Prices a payment and opens an invoice for it in one coin on one chain. */
export async function openInvoice(userId: string, purpose: Purpose, refId: string, assetId: string): Promise<{ ok: true; invoice: InvoiceView; title: string } | { ok: false; status: number; error: string }> {
  const asset = assetOf(assetId);
  if (!asset || !(cryptoAssets() as string[]).includes(asset.id)) return { ok: false, status: 400, error: 'That coin is not available for payments yet.' };
  const priced = await priceFor(purpose, refId, userId);
  if (!priced.ok) return priced;
  // Reopening the checkout keeps the same payment (and the same amount) while it is still open.
  const existing = await findOpenCryptoInvoice(userId, purpose, refId, asset.id);
  if (existing && existing.price_cents === priced.cents) return { ok: true, invoice: invoiceView(existing), title: priced.title };
  let rate: number;
  let price: number;
  try {
    [rate, price] = await Promise.all([usdRate(priced.currency), coinPrice(asset)]);
  } catch {
    return { ok: false, status: 503, error: 'Today’s prices could not be read. Try again in a minute, or pay with USDT or USDC.' };
  }
  const address = addressFor(asset.id, process.env as Record<string, string | undefined>);
  const row = await createCryptoInvoice({
    user_id: userId,
    purpose,
    ref_id: refId,
    network: asset.id,
    amount: amountFor(priced.cents, rate, randomInt(1, 100), asset.places, price),
    price_cents: priced.cents,
    currency: priced.currency,
    rate,
    coin_price: asset.stable ? null : price,
    address,
    expires_at: new Date(Date.now() + (asset.stable ? INVOICE_MINUTES : VOLATILE_MINUTES) * 60_000).toISOString(),
  });
  if (!row) return { ok: false, status: 500, error: 'The payment could not be started. Try again.' };
  return { ok: true, invoice: invoiceView(row), title: priced.title };
}

export type CheckResult = { status: PaymentStatus | 'taken' | 'invalid'; note: string; done?: string };

/** Reads a transaction for an invoice and, when it pays in full and is confirmed, delivers what was bought. */
export async function checkInvoice(row: CryptoInvoiceRow, rawHash: string, userId: string, userName: string, email: string | null = null): Promise<CheckResult> {
  const asset = assetOf(row.network) as Asset;
  const chain = chainOf(asset)!;
  const hash = normalizeTxHash(rawHash, chain);
  if (!hash) return { status: 'invalid', note: 'That does not look like a transaction hash. In Trust Wallet, open the transfer and copy its transaction ID.' };
  if (row.status === 'paid') return { status: 'paid', note: 'This payment is already complete.' };
  if (await cryptoTxUsed(hash)) return { status: 'taken', note: 'That transaction has already been used for another payment.' };

  const tx = await readChainTx(asset.id, hash, row.address);
  const verdict = judgePayment(tx, { network: asset.id, amount: row.amount, createdAt: row.created_at });
  if (verdict.status !== 'paid') return verdict;

  // Still check the thing can take the payment before binding the transaction to it.
  if (row.purpose !== 'plan' && row.purpose !== 'test') {
    const priced = await priceFor(row.purpose, row.ref_id, userId);
    if (!priced.ok) return { status: 'invalid', note: `${priced.error} Your payment arrived; contact us and we will apply it.` };
  }
  const claimed = await claimCryptoInvoice(row.id, hash);
  if (claimed === 'taken') return { status: 'taken', note: 'That transaction has already been used for another payment.' };
  if (claimed !== 'ok') return { status: 'invalid', note: 'This payment could not be recorded. Try again in a moment.' };

  const result = await deliver(row, hash, userId, userName);
  // A receipt by email for every completed payment (best effort: a failed email never undoes a payment).
  if (email && row.purpose !== 'test') {
    const title = row.purpose === 'plan' ? `${getPaidPlan(row.ref_id)?.name ?? 'Plan'}, 30 days` : row.purpose === 'agreement' ? 'Project escrow' : 'Contract funding';
    const until = result.done ? new Date(result.done).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    await sendStageEmail('crypto_receipt', email, { title, amount: `${row.amount} ${asset.coin}`, network: chain.name, txUrl: `${chain.explorer}${hash}`, until }).catch(() => undefined);
  }
  return result;
}

/** Hands over what was paid for: the plan's days, the escrow, or the contract funding. */
async function deliver(row: CryptoInvoiceRow, hash: string, userId: string, userName: string): Promise<CheckResult> {
  const asset = assetOf(row.network) as Asset;
  const label = `${asset.coin} (${chainOf(asset)!.name})`;
  if (row.purpose === 'test') {
    await postOpsEvent('plan_requested', { title: `Crypto test payment received: ${row.amount} ${label}` });
    return { status: 'paid', note: 'Test payment received and confirmed on-chain. Crypto checkout works.' };
  }
  if (row.purpose === 'plan') {
    const until = await extendCryptoPlan(userId, row.ref_id);
    await recordFunnelEvent('subscription_active', { signedIn: true, properties: { source: `${row.ref_id}-crypto` } });
    await postOpsEvent('plan_requested', { title: `PAID in crypto: ${row.ref_id} · ${row.amount} ${label}` });
    return { status: 'paid', note: 'Payment received. Your plan is on.', done: until ?? undefined };
  }
  if (row.purpose === 'agreement') {
    const agreement = await getAgreementById(row.ref_id);
    if (!agreement) return { status: 'paid', note: 'Payment received. We will apply it to your project.' };
    await submitAgreementFunding(row.ref_id, hash, label);
    await completeAgreementFunding(agreement, 'onchain');
    return { status: 'paid', note: 'Payment received. The project is funded.' };
  }
  const found = await getPeerContract(row.ref_id);
  if (!found.ok) return { status: 'paid', note: 'Payment received. We will apply it to your contract.' };
  const contract = peerRowToContract(found.row);
  const submitted = applyAction(contract, 'submit_funding', { userId, isStaff: false }, { tx: hash }, new Date(), contract.feePercent);
  if (!submitted.ok) return { status: 'paid', note: 'Payment received. We will apply it to your contract.' };
  const verified = applyAction(submitted.contract, 'verify_funding', { userId: 'brandforge-onchain-check', isStaff: true }, { approve: true }, new Date(), contract.feePercent);
  if (!verified.ok) return { status: 'paid', note: 'Payment received. We will apply it to your contract.' };
  const saved = await savePeerContract(row.ref_id, verified.contract, found.row.updated_at);
  if (saved.ok) await announce(saved.row, 'funded', { id: userId, name: userName });
  return { status: 'paid', note: 'Payment received. The contract is funded.' };
}

/**
 * Watches for an invoice's payment so the member does not have to paste anything: when a transfer of exactly the tagged
 * amount reaches our address, it is checked like a pasted one and delivered. `cursor` lets each look read only new blocks.
 */
export async function watchInvoice(row: CryptoInvoiceRow, userId: string, userName: string, cursor: number | null, email: string | null = null): Promise<CheckResult & { cursor: number | null }> {
  if (row.status === 'paid') return { status: 'paid', note: 'This payment is already complete.', cursor };
  const asset = assetOf(row.network) as Asset;
  const found = await findPayment(asset.id, row.address, Date.parse(row.created_at), toUnits(row.amount, asset.decimals), cursor);
  if (!found.hash) return { status: 'waiting' as PaymentStatus, note: 'Waiting for your payment. This updates by itself when it arrives.', cursor: found.cursor };
  // Keep watching from before this block while it confirms, so the same transfer is seen again on the next look.
  const result = await checkInvoice(row, found.hash, userId, userName, email);
  return { ...result, cursor: result.status === 'confirming' ? cursor : found.cursor };
}
