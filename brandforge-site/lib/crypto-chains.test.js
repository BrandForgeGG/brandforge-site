'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('./crypto-chains.js');

// The founder's real receiving addresses (public), so the checks run against what is live.
const ENV = {
  NEXT_PUBLIC_CRYPTO_EVM_ADDRESS: '0x2Ab3D3CD4e15675d09f9ea6646b43dE6be03c523',
  NEXT_PUBLIC_CRYPTO_TRON_ADDRESS: 'TU6mpXAy9o4D6QS1XxA4tYvtuqmQWFaqZq',
  NEXT_PUBLIC_CRYPTO_SOL_ADDRESS: 'CKweMuYXDfRfLtrFMtQbYcApkyymt7Yyk2cDT9gCWKxj',
  NEXT_PUBLIC_CRYPTO_BTC_ADDRESS: 'bc1qqpx4y033ul84xqh5zagx6et9kmkpzwhe0qzrvg',
  NEXT_PUBLIC_CRYPTO_LTC_ADDRESS: 'ltc1qjgw8hn83m7xtr30l0uqj737rzl0p88gnuu08mh',
};

test('addresses are checked with their checksums', () => {
  assert.equal(c.tronToHex('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), 'a614f803b6fd780986a42c78ec9c7f77e6ded13c');
  assert.equal(c.isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u'), false);
  assert.equal(c.isUtxoAddress(ENV.NEXT_PUBLIC_CRYPTO_BTC_ADDRESS, 'bitcoin'), true);
  assert.equal(c.isUtxoAddress('bc1qqpx4y033ul84xqh5zagx6et9kmkpzwhe0qzrvh', 'bitcoin'), false);
  assert.equal(c.isUtxoAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'bitcoin'), true);
  assert.equal(c.isUtxoAddress(ENV.NEXT_PUBLIC_CRYPTO_LTC_ADDRESS, 'litecoin'), true);
  assert.equal(c.isUtxoAddress(ENV.NEXT_PUBLIC_CRYPTO_BTC_ADDRESS, 'litecoin'), false);
  assert.equal(c.isSolanaAddress(ENV.NEXT_PUBLIC_CRYPTO_SOL_ADDRESS), true);
  assert.equal(c.isSolanaAddress('0x2Ab3D3CD4e15675d09f9ea6646b43dE6be03c523'), false);
});

test('each chain switches on with its own valid address', () => {
  assert.deepEqual(c.enabledAssets({}), []);
  assert.deepEqual(c.enabledAssets(ENV), c.ASSET_IDS);
  const evmOnly = c.enabledAssets({ NEXT_PUBLIC_CRYPTO_EVM_ADDRESS: ENV.NEXT_PUBLIC_CRYPTO_EVM_ADDRESS });
  assert.ok(evmOnly.includes('usdt-bsc') && evmOnly.includes('eth-base') && !evmOnly.includes('btc') && !evmOnly.includes('usdt-tron'));
  assert.equal(c.addressFor('btc', { NEXT_PUBLIC_CRYPTO_BTC_ADDRESS: 'not-an-address' }), '');
});

test('old option names still resolve', () => {
  assert.equal(c.assetOf('bsc-usdt').id, 'usdt-bsc');
  assert.equal(c.assetOf('base-usdc').id, 'usdc-base');
  assert.equal(c.assetOf('nope'), null);
});

test('stablecoin amounts convert, round up to the cent and carry a tag', () => {
  assert.equal(c.amountFor(1900, 1.0842, 37), '20.6037');
  assert.equal(c.amountFor(1900, 1, 0), '19.0001');
  assert.equal(c.toUnits('20.6037', 18), 20603700000000000000n);
  assert.equal(c.fromUnits(20603700n, 6), '20.6037');
});

test('coins that move are priced at today’s price, at their own precision', () => {
  // 19 EUR at 1.12 = 21.28 USD; at 82,369 USD per BTC that is 0.00025835 BTC, plus a tag in satoshis.
  assert.equal(c.amountFor(1900, 1.12, 12, 8, 82369), '0.00025847');
  assert.equal(c.amountFor(100, 1, 5, 6, 2454.23), '0.000413');
  assert.equal(c.amountFor(100, 1, 1, 3, 0.332262), '3.011');
});

test('trust wallet links follow the documented send format, for tokens and coins', () => {
  assert.equal(
    c.trustLink('usdt-bsc', '0xabc', '20.6037'),
    'https://link.trustwallet.com/send?asset=c20000714_t0x55d398326f99059fF775485246999027B3197955&address=0xabc&amount=20.6037'
  );
  assert.equal(c.trustLink('btc', 'bc1q', '0.0002'), 'https://link.trustwallet.com/send?asset=c0&address=bc1q&amount=0.0002');
  assert.match(c.trustLink('usdc-solana', 'So1', '1.0001'), /asset=c501_tEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/);
  assert.match(c.paymentUri('usdc-base', '0x650b5e446edabad7eba7fa7bb2f6119b2630bfbb', '1.5'), /^ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453\/transfer\?address=0x650b.*&uint256=1500000$/);
  assert.equal(c.paymentUri('btc', 'bc1q', '0.0002'), 'bitcoin:bc1q?amount=0.0002');
});

test('transfers are summed only for the right token and recipient', () => {
  const to = '650b5e446edabad7eba7fa7bb2f6119b2630bfbb';
  const token = '55d398326f99059ff775485246999027b3197955';
  const pad = (hex) => `0x${hex.padStart(64, '0')}`;
  const logs = [
    { address: `0x${token}`, topics: [`0x${c.TRANSFER_TOPIC}`, pad('11'), pad(to)], data: pad((5n * 10n ** 18n).toString(16)) },
    { address: '0xdeadbeef00000000000000000000000000000000', topics: [`0x${c.TRANSFER_TOPIC}`, pad('11'), pad(to)], data: pad('ffff') },
    { address: `0x${token}`, topics: [`0x${c.TRANSFER_TOPIC}`, pad('11'), pad('22')], data: pad('ffff') },
  ];
  assert.equal(c.transfersTo(logs, token, to), 5n * 10n ** 18n);
});

test('a payment is judged on success, amount, timing and confirmations', () => {
  const invoice = { network: 'usdt-tron', amount: '20.6037', createdAt: '2026-10-15T10:00:00Z' };
  const at = Date.parse('2026-10-15T10:05:00Z');
  const tx = (units, confirmations, extra = {}) => ({ found: true, success: true, units, confirmations, time: at, ...extra });
  assert.equal(c.judgePayment(null, invoice).status, 'missing');
  assert.equal(c.judgePayment(tx(20603700n, 30, { success: false }), invoice).status, 'failed');
  assert.equal(c.judgePayment(tx(0n, 30), invoice).status, 'wrong');
  assert.equal(c.judgePayment(tx(20000000n, 30), invoice).status, 'short');
  assert.equal(c.judgePayment(tx(20603700n, 3), invoice).status, 'confirming');
  assert.equal(c.judgePayment(tx(20603700n, 30, { time: Date.parse('2026-10-14T10:00:00Z') }), invoice).status, 'early');
  assert.equal(c.judgePayment(tx(20603700n, 30), invoice).status, 'paid');
  assert.equal(c.judgePayment(tx(25000000n, 30), invoice).status, 'paid');
  // An unconfirmed Bitcoin payment has no block time yet: it is confirming, not early.
  const btc = { network: 'btc', amount: '0.00025847', createdAt: '2026-10-15T10:00:00Z' };
  assert.equal(c.judgePayment({ found: true, success: true, units: 25847n, confirmations: 0, time: null }, btc).status, 'confirming');
});

test('transaction hashes are normalized per chain', () => {
  const h = 'A'.repeat(64);
  assert.equal(c.normalizeTxHash(`0x${h}`, c.CHAINS.bsc), `0x${'a'.repeat(64)}`);
  assert.equal(c.normalizeTxHash(`0x${h}`, c.CHAINS.tron), 'a'.repeat(64));
  assert.equal(c.normalizeTxHash(h, c.CHAINS.bitcoin), 'a'.repeat(64));
  const sig = '5'.repeat(88);
  assert.equal(c.normalizeTxHash(sig, c.CHAINS.solana), sig);
  assert.equal(c.normalizeTxHash('nope', c.CHAINS.bsc), null);
});

test('the tagged amount picks out exactly one payment', () => {
  const list = [{ hash: 'a', units: 21307400n }, { hash: 'b', units: 21307500n }, { hash: 'c', units: 21307500n }];
  assert.equal(c.exactMatch(list, 21307500n), 'b');
  assert.equal(c.exactMatch(list, 21300000n), null);
});

test('the browser sees names, icons and fees, never config', () => {
  const view = c.publicAsset('usdt-tron');
  assert.deepEqual(Object.keys(view).sort(), ['chain', 'chainIcon', 'chainName', 'coin', 'feeNote', 'icon', 'id', 'name', 'speed', 'stable']);
  assert.equal(view.icon, 'usdt');
  assert.equal(view.chainIcon, 'trx');
});
