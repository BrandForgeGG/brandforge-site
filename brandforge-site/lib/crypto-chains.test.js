'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('./crypto-chains.js');

test('tron addresses decode with their checksum, and bad ones are refused', () => {
  // The USDT contract on Tron.
  assert.equal(c.tronToHex('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), 'a614f803b6fd780986a42c78ec9c7f77e6ded13c');
  assert.equal(c.tronToHex('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u'), null);
  assert.equal(c.tronToHex('0x55d398326f99059fF775485246999027B3197955'), null);
  assert.equal(c.isEvmAddress('0x55d398326f99059fF775485246999027B3197955'), true);
});

test('networks switch on only with a valid receiving address', () => {
  assert.deepEqual(c.enabledNetworks({}), []);
  const env = { NEXT_PUBLIC_CRYPTO_EVM_ADDRESS: '0x650b5e446edabad7eba7fa7bb2f6119b2630bfbb', NEXT_PUBLIC_CRYPTO_TRON_ADDRESS: 'not-an-address' };
  assert.deepEqual(c.enabledNetworks(env), ['bsc-usdt', 'base-usdc']);
  assert.deepEqual(c.enabledNetworks({ NEXT_PUBLIC_CRYPTO_TRON_ADDRESS: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' }), ['tron-usdt']);
});

test('amounts convert, round up to the cent and carry a small tag', () => {
  assert.equal(c.amountFor(1900, 1.0842, 37), '20.6037');
  assert.equal(c.amountFor(1900, 1, 0), '19.0001');
  assert.equal(c.toUnits('20.6037', 6), 20603700n);
  assert.equal(c.toUnits('20.6037', 18), 20603700000000000000n);
  assert.equal(c.fromUnits(20603700n, 6), '20.6037');
});

test('trust wallet links follow the documented send format', () => {
  const link = c.trustLink('bsc-usdt', '0xabc', '20.6037');
  assert.equal(link, 'https://link.trustwallet.com/send?asset=c20000714_t0x55d398326f99059fF775485246999027B3197955&address=0xabc&amount=20.6037');
  assert.match(c.paymentUri('base-usdc', '0x650b5e446edabad7eba7fa7bb2f6119b2630bfbb', '1.5'), /^ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453\/transfer\?address=0x650b.*&uint256=1500000$/);
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
  const invoice = { network: 'tron-usdt', amount: '20.6037', createdAt: '2026-10-15T10:00:00Z' };
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
});

test('transaction hashes are normalized per network', () => {
  const h = 'A'.repeat(64);
  assert.equal(c.normalizeTxHash(`0x${h}`, c.NETWORKS['bsc-usdt']), `0x${'a'.repeat(64)}`);
  assert.equal(c.normalizeTxHash(`0x${h}`, c.NETWORKS['tron-usdt']), 'a'.repeat(64));
  assert.equal(c.normalizeTxHash('nope', c.NETWORKS['bsc-usdt']), null);
});

test('the tagged amount picks out exactly one payment', () => {
  const list = [{ hash: 'a', units: 21307400n }, { hash: 'b', units: 21307500n }, { hash: 'c', units: 21307500n }];
  assert.equal(c.exactMatch(list, 21307500n), 'b');
  assert.equal(c.exactMatch(list, 21300000n), null);
  assert.equal(c.exactMatch(null, 1n), null);
});
