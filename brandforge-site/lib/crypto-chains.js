'use strict';

// Crypto payments, the pure part: the networks we take stablecoins on, the exact amount a member pays, the links that
// open Trust Wallet with everything filled in, and the rules that turn an on-chain transaction into "paid". Network I/O
// lives in lib/crypto-verify.ts; this file only decides, so node:test can check every rule.

const { createHash } = require('crypto');

// Stablecoins only: a dollar stays a dollar between the invoice and the payment. Each network is switched on by setting
// its receiving address (NEXT_PUBLIC_CRYPTO_EVM_ADDRESS for BNB Chain and Base, NEXT_PUBLIC_CRYPTO_TRON_ADDRESS for Tron).
const NETWORKS = {
  'bsc-usdt': {
    id: 'bsc-usdt',
    label: 'USDT on BNB Smart Chain',
    short: 'USDT · BNB Chain',
    kind: 'evm',
    chainId: 56,
    token: '0x55d398326f99059fF775485246999027B3197955',
    symbol: 'USDT',
    decimals: 18,
    confirmations: 12,
    trustCoin: 20000714,
    feeNote: 'The network fee is a few cents, paid in BNB.',
    explorer: 'https://bscscan.com/tx/',
    rpc: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com', 'https://bsc-dataseed1.defibit.io'],
    // Searching past blocks for incoming transfers: only some free nodes allow it.
    logRpc: ['https://bsc-rpc.publicnode.com'],
    blockSeconds: 0.75,
    maxLogSpan: 4000,
  },
  'tron-usdt': {
    id: 'tron-usdt',
    label: 'USDT on Tron (TRC-20)',
    short: 'USDT · Tron',
    kind: 'tron',
    token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    symbol: 'USDT',
    decimals: 6,
    confirmations: 19,
    trustCoin: 195,
    feeNote: 'The network fee is paid in TRX, usually about 1 to 2 dollars.',
    explorer: 'https://tronscan.org/#/transaction/',
    rpc: ['https://api.trongrid.io'],
    logRpc: [],
    blockSeconds: 3,
    maxLogSpan: 0,
  },
  'base-usdc': {
    id: 'base-usdc',
    label: 'USDC on Base',
    short: 'USDC · Base',
    kind: 'evm',
    chainId: 8453,
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6,
    confirmations: 12,
    trustCoin: 8453,
    feeNote: 'The network fee is under a cent, paid in ETH on Base.',
    explorer: 'https://basescan.org/tx/',
    rpc: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
    logRpc: ['https://base-rpc.publicnode.com'],
    blockSeconds: 2,
    maxLogSpan: 4000,
  },
};
const NETWORK_IDS = Object.keys(NETWORKS);

// keccak256("Transfer(address,address,uint256)"), the event every ERC-20 / TRC-20 token emits on a transfer.
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** A Tron address (base58, starts with T) as its 20-byte hex body, or null when it is not a valid address. */
function tronToHex(address) {
  const text = String(address || '').trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(text)) return null;
  let n = 0n;
  for (const ch of text) {
    const i = B58.indexOf(ch);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  if (hex.length !== 50) return null;
  const body = hex.slice(0, 42);
  const check = hex.slice(42);
  const once = createHash('sha256').update(Buffer.from(body, 'hex')).digest();
  const twice = createHash('sha256').update(once).digest('hex');
  if (twice.slice(0, 8) !== check || !body.startsWith('41')) return null;
  return body.slice(2);
}

function isTronAddress(value) {
  return tronToHex(value) !== null;
}

/** The receiving address for a network from the environment, or '' when that network is not switched on. */
function addressFor(networkId, env) {
  const network = NETWORKS[networkId];
  if (!network) return '';
  const raw = String((network.kind === 'tron' ? env.NEXT_PUBLIC_CRYPTO_TRON_ADDRESS : env.NEXT_PUBLIC_CRYPTO_EVM_ADDRESS) || '').trim();
  if (network.kind === 'tron') return isTronAddress(raw) ? raw : '';
  return isEvmAddress(raw) ? raw : '';
}

/** The networks members can pay on right now (those with a valid receiving address). */
function enabledNetworks(env) {
  return NETWORK_IDS.filter((id) => addressFor(id, env));
}

function normalizeTxHash(value, network) {
  const text = String(value || '').trim();
  const body = text.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(body)) return null;
  return network && network.kind === 'tron' ? body : `0x${body}`;
}

/**
 * The amount to pay, in dollars, as a 4-decimal string. The price is converted at `rate` (dollars per unit of the
 * invoice currency), rounded up to the cent, and given a small tag of 0.0001 to 0.0099 so this invoice's payment can be
 * told apart from any other payment of the same price.
 */
function amountFor(cents, rate, tag) {
  const dollars = Math.ceil((Number(cents) / 100) * Number(rate) * 100) / 100;
  const micro = Math.min(99, Math.max(1, Math.round(Number(tag) || 1)));
  return (dollars + micro / 10000).toFixed(4);
}

/** A decimal amount string as the token's smallest units. */
function toUnits(amount, decimals) {
  const [whole, frac = ''] = String(amount).trim().split('.');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac)) throw new Error('bad amount');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0');
}

function fromUnits(units, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  const frac = (units % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** The Trust Wallet link that opens a send screen with the token, address and amount filled in. */
function trustLink(networkId, address, amount) {
  const network = NETWORKS[networkId];
  const asset = `c${network.trustCoin}_t${network.token}`;
  return `https://link.trustwallet.com/send?asset=${encodeURIComponent(asset)}&address=${encodeURIComponent(address)}&amount=${encodeURIComponent(amount)}`;
}

/** A standard payment request for other wallets (EIP-681 on EVM chains; the plain address on Tron). */
function paymentUri(networkId, address, amount) {
  const network = NETWORKS[networkId];
  if (network.kind !== 'evm') return address;
  return `ethereum:${network.token}@${network.chainId}/transfer?address=${address}&uint256=${toUnits(amount, network.decimals).toString()}`;
}

const strip = (hex) => String(hex || '').toLowerCase().replace(/^0x/, '');
const topicAddress = (topic) => strip(topic).slice(-40);

/**
 * Sums the token transfers to `toHex` in one transaction's logs. Works for EVM receipts (log.address with 0x) and Tron
 * transaction info (log.address as hex without the 41 prefix). tokenHex and toHex are 20-byte hex without 0x.
 */
function transfersTo(logs, tokenHex, toHex) {
  let total = 0n;
  for (const log of Array.isArray(logs) ? logs : []) {
    const topics = Array.isArray(log && log.topics) ? log.topics : [];
    if (topics.length < 3 || strip(topics[0]) !== TRANSFER_TOPIC) continue;
    if (strip(log.address).slice(-40) !== tokenHex) continue;
    if (topicAddress(topics[2]) !== toHex) continue;
    const data = strip(log.data);
    if (!/^[0-9a-f]{1,64}$/.test(data)) continue;
    total += BigInt(`0x${data}`);
  }
  return total;
}

/**
 * The first transfer in a list that pays exactly `units` (the tagged amount picks out this invoice's payment).
 * transfers: [{ hash, units: bigint }]. Returns its hash, or null.
 */
function exactMatch(transfers, units) {
  for (const t of Array.isArray(transfers) ? transfers : []) if (t && t.units === units) return t.hash;
  return null;
}

/** The 20-byte hex (no 0x) of an address on a network: EVM as is, Tron decoded from base58. */
function hexOf(networkId, address) {
  const network = NETWORKS[networkId];
  if (!network) return null;
  if (network.kind === 'tron') return tronToHex(address);
  return isEvmAddress(address) ? strip(address) : null;
}

/**
 * Whether a transaction pays an invoice. tx: { success, units (bigint received by us), confirmations, time (ms) }.
 * Returns { status: 'paid' | 'confirming' | 'failed' | 'wrong' | 'short' | 'early', note }.
 */
function judgePayment(tx, invoice) {
  const network = NETWORKS[invoice.network];
  if (!tx || !tx.found) return { status: 'missing', note: 'That transaction was not found on this network yet. If you just sent it, wait a few seconds and check again, and make sure it is the right network.' };
  if (!tx.success) return { status: 'failed', note: 'That transaction failed on the network, so no money moved. Send the payment again.' };
  if (tx.units <= 0n) return { status: 'wrong', note: `That transaction did not send ${network.symbol} to the BrandForge address on ${network.short}.` };
  if (tx.time && invoice.createdAt && tx.time < Date.parse(invoice.createdAt) - 10 * 60_000) return { status: 'early', note: 'That transaction was sent before this payment was started, so it belongs to another payment.' };
  const expected = toUnits(invoice.amount, network.decimals);
  if (tx.units < expected) return { status: 'short', note: `That transaction sent ${fromUnits(tx.units, network.decimals)} ${network.symbol}; this payment needs ${invoice.amount}. Send the difference, or contact us and we will sort it out.` };
  if (tx.confirmations < network.confirmations) return { status: 'confirming', note: `Payment found. Waiting for the network to confirm it (${Math.max(0, tx.confirmations)} of ${network.confirmations}).` };
  return { status: 'paid', note: 'Payment received.' };
}

module.exports = {
  NETWORKS,
  NETWORK_IDS,
  TRANSFER_TOPIC,
  isEvmAddress,
  isTronAddress,
  tronToHex,
  addressFor,
  enabledNetworks,
  normalizeTxHash,
  amountFor,
  toUnits,
  fromUnits,
  trustLink,
  paymentUri,
  transfersTo,
  hexOf,
  judgePayment,
  exactMatch,
};
