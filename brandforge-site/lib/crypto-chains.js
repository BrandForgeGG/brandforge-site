'use strict';

// Crypto payments, the pure part: the coins and chains we take, the exact amount a member pays, the links that open
// Trust Wallet with everything filled in, and the rules that turn an on-chain transaction into "paid". Network I/O lives
// in lib/crypto-verify.ts; this file only decides, so node:test can check every rule.

const { createHash } = require('crypto');

// Chains. Each one is switched on by setting its receiving address: one 0x address covers every EVM chain
// (NEXT_PUBLIC_CRYPTO_EVM_ADDRESS); Tron, Solana, Bitcoin and Litecoin each have their own.
const CHAINS = {
  bsc: {
    id: 'bsc',
    name: 'BNB Smart Chain',
    kind: 'evm',
    address: 'evm',
    chainId: 56,
    trustCoin: 20000714,
    native: 'BNB',
    nativeDecimals: 18,
    confirmations: 12,
    blockSeconds: 0.75,
    feeNote: 'Network fee: a few cents, paid in BNB.',
    speed: 'About 30 seconds',
    explorer: 'https://bscscan.com/tx/',
    rpc: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com', 'https://bsc-dataseed1.defibit.io'],
    logRpc: ['https://bsc-rpc.publicnode.com'],
    maxLogSpan: 4000,
    icon: 'bnb',
  },
  tron: {
    id: 'tron',
    name: 'Tron',
    kind: 'tron',
    address: 'tron',
    trustCoin: 195,
    native: 'TRX',
    nativeDecimals: 6,
    confirmations: 19,
    blockSeconds: 3,
    feeNote: 'Network fee: paid in TRX, usually 1 to 2 dollars.',
    speed: 'About 1 minute',
    explorer: 'https://tronscan.org/#/transaction/',
    rpc: ['https://api.trongrid.io'],
    logRpc: [],
    maxLogSpan: 0,
    icon: 'trx',
  },
  base: {
    id: 'base',
    name: 'Base',
    kind: 'evm',
    address: 'evm',
    chainId: 8453,
    trustCoin: 8453,
    native: 'ETH',
    nativeDecimals: 18,
    confirmations: 12,
    blockSeconds: 2,
    feeNote: 'Network fee: under a cent, paid in ETH on Base.',
    speed: 'About 30 seconds',
    explorer: 'https://basescan.org/tx/',
    rpc: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
    logRpc: ['https://base-rpc.publicnode.com'],
    maxLogSpan: 4000,
    icon: 'base',
  },
  polygon: {
    id: 'polygon',
    name: 'Polygon',
    kind: 'evm',
    address: 'evm',
    chainId: 137,
    trustCoin: 966,
    native: 'POL',
    nativeDecimals: 18,
    confirmations: 32,
    blockSeconds: 2,
    feeNote: 'Network fee: about a cent, paid in POL.',
    speed: 'About 1 minute',
    explorer: 'https://polygonscan.com/tx/',
    rpc: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com'],
    logRpc: ['https://polygon-bor-rpc.publicnode.com'],
    maxLogSpan: 3000,
    icon: 'polygon',
  },
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    kind: 'evm',
    address: 'evm',
    chainId: 1,
    trustCoin: 60,
    native: 'ETH',
    nativeDecimals: 18,
    confirmations: 6,
    blockSeconds: 12,
    feeNote: 'Network fee: usually 1 to 5 dollars, paid in ETH.',
    speed: 'About 1 to 2 minutes',
    explorer: 'https://etherscan.io/tx/',
    rpc: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'],
    logRpc: ['https://ethereum-rpc.publicnode.com'],
    maxLogSpan: 1000,
    icon: 'eth',
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    kind: 'solana',
    address: 'sol',
    trustCoin: 501,
    native: 'SOL',
    nativeDecimals: 9,
    confirmations: 1,
    blockSeconds: 0.4,
    feeNote: 'Network fee: under a cent, paid in SOL.',
    speed: 'About 20 seconds',
    explorer: 'https://solscan.io/tx/',
    rpc: ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'],
    logRpc: [],
    maxLogSpan: 0,
    icon: 'sol',
  },
  bitcoin: {
    id: 'bitcoin',
    name: 'Bitcoin',
    kind: 'utxo',
    address: 'btc',
    trustCoin: 0,
    native: 'BTC',
    nativeDecimals: 8,
    confirmations: 1,
    blockSeconds: 600,
    feeNote: 'Network fee: varies, usually under 2 dollars.',
    speed: 'About 10 to 20 minutes',
    explorer: 'https://mempool.space/tx/',
    rpc: ['https://mempool.space/api'],
    logRpc: [],
    maxLogSpan: 0,
    icon: 'btc',
  },
  litecoin: {
    id: 'litecoin',
    name: 'Litecoin',
    kind: 'utxo',
    address: 'ltc',
    trustCoin: 2,
    native: 'LTC',
    nativeDecimals: 8,
    confirmations: 2,
    blockSeconds: 150,
    feeNote: 'Network fee: about a cent.',
    speed: 'About 5 minutes',
    explorer: 'https://litecoinspace.org/tx/',
    rpc: ['https://litecoinspace.org/api'],
    logRpc: [],
    maxLogSpan: 0,
    icon: 'ltc',
  },
};

const STABLE = { coingecko: null, binance: null };

// What a member can pay with. Stablecoins first: a dollar stays a dollar. Coins that move are priced live when the
// payment opens (CoinGecko, Binance as a backup) and the price is held for 30 minutes. `places` is how many decimals the
// amount shows; the last two of them carry the tag that tells this payment apart from any other.
const ASSETS = {
  'usdt-tron': { id: 'usdt-tron', coin: 'USDT', name: 'Tether', chain: 'tron', token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, places: 4, stable: true, ...STABLE },
  'usdt-bsc': { id: 'usdt-bsc', coin: 'USDT', name: 'Tether', chain: 'bsc', token: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, places: 4, stable: true, ...STABLE },
  'usdt-ethereum': { id: 'usdt-ethereum', coin: 'USDT', name: 'Tether', chain: 'ethereum', token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, places: 4, stable: true, ...STABLE },
  'usdt-polygon': { id: 'usdt-polygon', coin: 'USDT', name: 'Tether', chain: 'polygon', token: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, places: 4, stable: true, ...STABLE },
  'usdt-solana': { id: 'usdt-solana', coin: 'USDT', name: 'Tether', chain: 'solana', token: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, places: 4, stable: true, ...STABLE },
  'usdc-base': { id: 'usdc-base', coin: 'USDC', name: 'USD Coin', chain: 'base', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, places: 4, stable: true, ...STABLE },
  'usdc-bsc': { id: 'usdc-bsc', coin: 'USDC', name: 'USD Coin', chain: 'bsc', token: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, places: 4, stable: true, ...STABLE },
  'usdc-solana': { id: 'usdc-solana', coin: 'USDC', name: 'USD Coin', chain: 'solana', token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, places: 4, stable: true, ...STABLE },
  'usdc-polygon': { id: 'usdc-polygon', coin: 'USDC', name: 'USD Coin', chain: 'polygon', token: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, places: 4, stable: true, ...STABLE },
  'usdc-ethereum': { id: 'usdc-ethereum', coin: 'USDC', name: 'USD Coin', chain: 'ethereum', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, places: 4, stable: true, ...STABLE },
  btc: { id: 'btc', coin: 'BTC', name: 'Bitcoin', chain: 'bitcoin', token: null, decimals: 8, places: 8, stable: false, coingecko: 'bitcoin', binance: 'BTCUSDT' },
  'eth-ethereum': { id: 'eth-ethereum', coin: 'ETH', name: 'Ether', chain: 'ethereum', token: null, decimals: 18, places: 6, stable: false, coingecko: 'ethereum', binance: 'ETHUSDT' },
  'eth-base': { id: 'eth-base', coin: 'ETH', name: 'Ether', chain: 'base', token: null, decimals: 18, places: 6, stable: false, coingecko: 'ethereum', binance: 'ETHUSDT' },
  'bnb-bsc': { id: 'bnb-bsc', coin: 'BNB', name: 'BNB', chain: 'bsc', token: null, decimals: 18, places: 6, stable: false, coingecko: 'binancecoin', binance: 'BNBUSDT' },
  sol: { id: 'sol', coin: 'SOL', name: 'Solana', chain: 'solana', token: null, decimals: 9, places: 6, stable: false, coingecko: 'solana', binance: 'SOLUSDT' },
  trx: { id: 'trx', coin: 'TRX', name: 'Tron', chain: 'tron', token: null, decimals: 6, places: 3, stable: false, coingecko: 'tron', binance: 'TRXUSDT' },
  ltc: { id: 'ltc', coin: 'LTC', name: 'Litecoin', chain: 'litecoin', token: null, decimals: 8, places: 6, stable: false, coingecko: 'litecoin', binance: 'LTCUSDT' },
};
const ASSET_IDS = Object.keys(ASSETS);
// The first three options had other names; payments opened under them still resolve.
const LEGACY = { 'bsc-usdt': 'usdt-bsc', 'tron-usdt': 'usdt-tron', 'base-usdc': 'usdc-base' };

function assetOf(id) {
  return ASSETS[LEGACY[id] || id] || null;
}

function chainOf(asset) {
  return asset ? CHAINS[asset.chain] : null;
}

// keccak256("Transfer(address,address,uint256)"), the event every ERC-20 / TRC-20 token emits on a transfer.
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(text) {
  let n = 0n;
  for (const ch of text) {
    const i = B58.indexOf(ch);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  let hex = n === 0n ? '' : n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros++;
  return Buffer.concat([Buffer.alloc(zeros), Buffer.from(hex, 'hex')]);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest();

/** A base58check payload (version + body), or null when the checksum is wrong. */
function base58Check(text) {
  const raw = base58Decode(text);
  if (!raw || raw.length < 5) return null;
  const body = raw.subarray(0, raw.length - 4);
  return sha256(sha256(body)).subarray(0, 4).equals(raw.subarray(raw.length - 4)) ? body : null;
}

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

/** A Tron address (base58, starts with T) as its 20-byte hex body, or null when it is not a valid address. */
function tronToHex(address) {
  const text = String(address || '').trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(text)) return null;
  const body = base58Check(text);
  if (!body || body.length !== 21 || body[0] !== 0x41) return null;
  return body.subarray(1).toString('hex');
}

function isTronAddress(value) {
  return tronToHex(value) !== null;
}

function isSolanaAddress(value) {
  const text = String(value || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  const raw = base58Decode(text);
  return Boolean(raw && raw.length === 32);
}

// Bech32 / bech32m (BIP 173 / 350) checksum, for native SegWit and Taproot addresses.
const BECH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bechPolymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= G[i];
  }
  return chk;
}
function isBech32(address, hrp) {
  const text = String(address || '').trim().toLowerCase();
  if (!text.startsWith(`${hrp}1`) || text.length < hrp.length + 8 || text.length > 90) return false;
  const data = [];
  for (const ch of text.slice(hrp.length + 1)) {
    const i = BECH.indexOf(ch);
    if (i < 0) return false;
    data.push(i);
  }
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const mod = bechPolymod([...expanded, ...data]);
  return mod === 1 || mod === 0x2bc830a3;
}

/** A Bitcoin or Litecoin address: SegWit (bc1 / ltc1) or legacy base58 (1, 3 / L, M). */
function isUtxoAddress(value, chain) {
  const text = String(value || '').trim();
  if (chain === 'bitcoin') {
    if (/^bc1/i.test(text)) return isBech32(text, 'bc');
    const body = /^[13]/.test(text) ? base58Check(text) : null;
    return Boolean(body && body.length === 21 && (body[0] === 0x00 || body[0] === 0x05));
  }
  if (/^ltc1/i.test(text)) return isBech32(text, 'ltc');
  const body = /^[LM3]/.test(text) ? base58Check(text) : null;
  return Boolean(body && body.length === 21 && (body[0] === 0x30 || body[0] === 0x32 || body[0] === 0x05));
}

const ADDRESS_ENV = {
  evm: 'NEXT_PUBLIC_CRYPTO_EVM_ADDRESS',
  tron: 'NEXT_PUBLIC_CRYPTO_TRON_ADDRESS',
  sol: 'NEXT_PUBLIC_CRYPTO_SOL_ADDRESS',
  btc: 'NEXT_PUBLIC_CRYPTO_BTC_ADDRESS',
  ltc: 'NEXT_PUBLIC_CRYPTO_LTC_ADDRESS',
};

function validAddress(chain, value) {
  if (chain.kind === 'evm') return isEvmAddress(value);
  if (chain.kind === 'tron') return isTronAddress(value);
  if (chain.kind === 'solana') return isSolanaAddress(value);
  return isUtxoAddress(value, chain.id);
}

/** The receiving address for an asset from the environment, or '' when that asset is not switched on. */
function addressFor(assetId, env) {
  const chain = chainOf(assetOf(assetId));
  if (!chain) return '';
  const raw = String(env[ADDRESS_ENV[chain.address]] || '').trim();
  return validAddress(chain, raw) ? raw : '';
}

/** The assets members can pay with right now (those whose chain has a valid receiving address). */
function enabledAssets(env) {
  return ASSET_IDS.filter((id) => addressFor(id, env));
}

function normalizeTxHash(value, chain) {
  const text = String(value || '').trim();
  if (!chain) return null;
  if (chain.kind === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(text) ? text : null;
  const body = text.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(body)) return null;
  return chain.kind === 'evm' ? `0x${body}` : body;
}

/** A decimal amount string as the smallest units. */
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

/**
 * The amount to pay as a string with the asset's `places` decimals. The price in the invoice currency is converted with
 * `rate` (dollars per unit) and rounded up to the cent, then divided by `coinPrice` (dollars per coin, 1 for stablecoins)
 * and rounded up at the asset's precision, and a tag of 1 to 99 in the last places is added so this invoice's payment can
 * be told apart from any other.
 */
function amountFor(cents, rate, tag, places = 4, coinPrice = 1) {
  const usdCents = Math.ceil(Number(cents) * Number(rate) - 1e-9);
  const scale = 10 ** places;
  const steps = Math.ceil(((usdCents / 100) / Number(coinPrice)) * scale - 1e-6);
  const micro = Math.min(99, Math.max(1, Math.round(Number(tag) || 1)));
  const units = BigInt(steps + micro);
  const base = 10n ** BigInt(places);
  return `${units / base}.${(units % base).toString().padStart(places, '0')}`;
}

/** The Trust Wallet link that opens a send screen with the coin, address and amount filled in. */
function trustLink(assetId, address, amount) {
  const asset = assetOf(assetId);
  const chain = chainOf(asset);
  const uai = asset.token ? `c${chain.trustCoin}_t${asset.token}` : `c${chain.trustCoin}`;
  return `https://link.trustwallet.com/send?asset=${encodeURIComponent(uai)}&address=${encodeURIComponent(address)}&amount=${encodeURIComponent(amount)}`;
}

/** A standard payment request other wallets understand (EIP-681, BIP-21, Solana Pay), or the plain address. */
function paymentUri(assetId, address, amount) {
  const asset = assetOf(assetId);
  const chain = chainOf(asset);
  if (chain.kind === 'evm') {
    return asset.token
      ? `ethereum:${asset.token}@${chain.chainId}/transfer?address=${address}&uint256=${toUnits(amount, asset.decimals).toString()}`
      : `ethereum:${address}@${chain.chainId}?value=${toUnits(amount, asset.decimals).toString()}`;
  }
  if (chain.id === 'bitcoin') return `bitcoin:${address}?amount=${amount}`;
  if (chain.id === 'litecoin') return `litecoin:${address}?amount=${amount}`;
  if (chain.kind === 'solana') return `solana:${address}?amount=${amount}${asset.token ? `&spl-token=${asset.token}` : ''}`;
  return address;
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

/** The first transfer in a list that pays exactly `units` (the tagged amount picks out this invoice's payment). */
function exactMatch(transfers, units) {
  for (const t of Array.isArray(transfers) ? transfers : []) if (t && t.units === units) return t.hash;
  return null;
}

/** The 20-byte hex (no 0x) of an EVM or Tron address, or null. */
function hexOf(chainId, address) {
  const chain = CHAINS[chainId];
  if (!chain) return null;
  if (chain.kind === 'tron') return tronToHex(address);
  if (chain.kind === 'evm') return isEvmAddress(address) ? strip(address) : null;
  return null;
}

/**
 * Whether a transaction pays an invoice. tx: { found, success, units (bigint received by us), confirmations, time (ms) }.
 * Returns { status: 'paid' | 'confirming' | 'failed' | 'wrong' | 'short' | 'early' | 'missing', note }.
 */
function judgePayment(tx, invoice) {
  const asset = assetOf(invoice.network);
  const chain = chainOf(asset);
  const where = `${asset.coin} on ${chain.name}`;
  if (!tx || !tx.found) return { status: 'missing', note: `That transaction was not found on ${chain.name} yet. If you just sent it, wait a few seconds and check again.` };
  if (!tx.success) return { status: 'failed', note: 'That transaction failed on the network, so no money moved. Send the payment again.' };
  if (tx.units <= 0n) return { status: 'wrong', note: `That transaction did not send ${where} to the BrandForge address.` };
  if (tx.time && invoice.createdAt && tx.time < Date.parse(invoice.createdAt) - 10 * 60_000) return { status: 'early', note: 'That transaction was sent before this payment was started, so it belongs to another payment.' };
  const expected = toUnits(invoice.amount, asset.decimals);
  if (tx.units < expected) return { status: 'short', note: `That transaction sent ${fromUnits(tx.units, asset.decimals)} ${asset.coin}; this payment needs ${invoice.amount}. Send the difference, or contact us and we will sort it out.` };
  if (tx.confirmations < chain.confirmations) return { status: 'confirming', note: chain.kind === 'solana' ? 'Payment found. Waiting for Solana to finalize it.' : `Payment found. Waiting for the network to confirm it (${Math.max(0, tx.confirmations)} of ${chain.confirmations}).` };
  return { status: 'paid', note: 'Payment received.' };
}

/** What the checkout shows for an asset, safe to send to the browser. */
function publicAsset(id) {
  const asset = assetOf(id);
  const chain = chainOf(asset);
  return {
    id: asset.id,
    coin: asset.coin,
    name: asset.name,
    stable: asset.stable,
    chain: chain.id,
    chainName: chain.name,
    icon: asset.coin.toLowerCase(),
    chainIcon: chain.icon,
    feeNote: chain.feeNote,
    speed: chain.speed,
  };
}

module.exports = {
  CHAINS,
  ASSETS,
  ASSET_IDS,
  ADDRESS_ENV,
  TRANSFER_TOPIC,
  assetOf,
  chainOf,
  isEvmAddress,
  isTronAddress,
  isSolanaAddress,
  isUtxoAddress,
  tronToHex,
  addressFor,
  enabledAssets,
  normalizeTxHash,
  amountFor,
  toUnits,
  fromUnits,
  trustLink,
  paymentUri,
  transfersTo,
  exactMatch,
  hexOf,
  judgePayment,
  publicAsset,
};
