import { randomInt } from 'node:crypto';
import { NETWORKS, addressFor, amountFor, enabledNetworks, judgePayment, normalizeTxHash, paymentUri, trustLink, type NetworkId, type PaymentStatus } from '@/lib/crypto-chains.js';
import { readChainTx } from '@/lib/crypto-verify';
import { getPaidPlan } from '@/lib/plans.js';
import { canSubmitFunding } from '@/lib/money-authz.js';
import { applyAction } from '@/lib/peer-contract.js';
import {
  claimCryptoInvoice,
  createCryptoInvoice,
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

// Crypto checkout, the server part. A payment is priced here from the record it pays for (never from what the browser
// says), converted to dollars at today's ECB rate, and given a small tag so it can be told apart. Once the member sends
// it, the transaction is read on its own chain and, when it pays in full and is confirmed, the plan, the escrow or the
// contract moves on by itself: no one has to check by hand.

export type Purpose = 'plan' | 'agreement' | 'peer' | 'test';
const INVOICE_MINUTES = 60;

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
  network: NetworkId;
  networkLabel: string;
  symbol: string;
  amount: string;
  address: string;
  trustLink: string;
  uri: string;
  feeNote: string;
  explorer: string;
  expiresAt: string;
  status: CryptoInvoiceRow['status'];
  price: { cents: number; currency: string; rate: number };
};

export function invoiceView(row: CryptoInvoiceRow): InvoiceView {
  const network = NETWORKS[row.network as NetworkId];
  return {
    id: row.id,
    network: network.id,
    networkLabel: network.label,
    symbol: network.symbol,
    amount: row.amount,
    address: row.address,
    trustLink: trustLink(network.id, row.address, row.amount),
    uri: paymentUri(network.id, row.address, row.amount),
    feeNote: network.feeNote,
    explorer: network.explorer,
    expiresAt: row.expires_at,
    status: row.status,
    price: { cents: row.price_cents, currency: row.currency, rate: Number(row.rate) },
  };
}

export function cryptoNetworks(): NetworkId[] {
  return enabledNetworks(process.env as Record<string, string | undefined>);
}

/** Prices a payment and opens an invoice for it on one network. */
export async function openInvoice(userId: string, purpose: Purpose, refId: string, networkId: string): Promise<{ ok: true; invoice: InvoiceView; title: string } | { ok: false; status: number; error: string }> {
  if (!(cryptoNetworks() as string[]).includes(networkId)) return { ok: false, status: 400, error: 'That network is not available for payments yet.' };
  const priced = await priceFor(purpose, refId, userId);
  if (!priced.ok) return priced;
  let rate: number;
  try {
    rate = await usdRate(priced.currency);
  } catch {
    return { ok: false, status: 503, error: 'Today’s exchange rate could not be read. Try again in a minute.' };
  }
  const address = addressFor(networkId, process.env as Record<string, string | undefined>);
  const row = await createCryptoInvoice({
    user_id: userId,
    purpose,
    ref_id: refId,
    network: networkId,
    amount: amountFor(priced.cents, rate, randomInt(1, 100)),
    price_cents: priced.cents,
    currency: priced.currency,
    rate,
    address,
    expires_at: new Date(Date.now() + INVOICE_MINUTES * 60_000).toISOString(),
  });
  if (!row) return { ok: false, status: 500, error: 'The payment could not be started. Try again.' };
  return { ok: true, invoice: invoiceView(row), title: priced.title };
}

export type CheckResult = { status: PaymentStatus | 'taken' | 'invalid'; note: string; done?: string };

/** Reads a transaction for an invoice and, when it pays in full and is confirmed, delivers what was bought. */
export async function checkInvoice(row: CryptoInvoiceRow, rawHash: string, userId: string, userName: string): Promise<CheckResult> {
  const network = NETWORKS[row.network as NetworkId];
  const hash = normalizeTxHash(rawHash, network);
  if (!hash) return { status: 'invalid', note: 'That does not look like a transaction hash. In Trust Wallet, open the transfer and copy its transaction ID.' };
  if (row.status === 'paid') return { status: 'paid', note: 'This payment is already complete.' };
  if (await cryptoTxUsed(hash)) return { status: 'taken', note: 'That transaction has already been used for another payment.' };

  const tx = await readChainTx(network.id, hash, row.address);
  const verdict = judgePayment(tx, { network: network.id, amount: row.amount, createdAt: row.created_at });
  if (verdict.status !== 'paid') return verdict;

  // Still check the thing can take the payment before binding the transaction to it.
  if (row.purpose !== 'plan' && row.purpose !== 'test') {
    const priced = await priceFor(row.purpose, row.ref_id, userId);
    if (!priced.ok) return { status: 'invalid', note: `${priced.error} Your payment arrived; contact us and we will apply it.` };
  }
  const claimed = await claimCryptoInvoice(row.id, hash);
  if (claimed === 'taken') return { status: 'taken', note: 'That transaction has already been used for another payment.' };
  if (claimed !== 'ok') return { status: 'invalid', note: 'This payment could not be recorded. Try again in a moment.' };

  const label = `${network.symbol} (${network.short})`;
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
