'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeTxHash,
  isValidTxHash,
  normalizeNetwork,
  isValidNetwork,
} = require('./crypto-payments.js');

test('normalizeTxHash trims surrounding whitespace', () => {
  assert.equal(normalizeTxHash('  abc123  '), 'abc123');
  assert.equal(normalizeTxHash(null), '');
  assert.equal(normalizeTxHash(undefined), '');
  assert.equal(normalizeTxHash(42), '');
});

test('isValidTxHash accepts plausible hashes from major networks', () => {
  // 64-char hex (BTC / EVM / Tron)
  assert.equal(isValidTxHash('a'.repeat(64)), true);
  assert.equal(
    isValidTxHash('4f3c2b1a98deadbeef00112233445566778899aabbccddeeff0011223344556677'),
    true
  );
  // 87-88 char base58 (Solana)
  assert.equal(isValidTxHash('5KtPn1LGuxhFAnBQbXHqNb8dYTRKKhCZQXgmGEhQp7QxJ2nvC3fYWkJp6r1rXW9x7b2vN4uT5yLzA1sD3fG'), true);
  // Short but plausible identifiers are allowed (some chains use shorter hashes)
  assert.equal(isValidTxHash('abcd1234'), true);
});

test('isValidTxHash rejects unusable input', () => {
  assert.equal(isValidTxHash(''), false);
  assert.equal(isValidTxHash('   '), false);
  assert.equal(isValidTxHash('abc'), false);
  assert.equal(isValidTxHash(null), false);
  assert.equal(isValidTxHash(undefined), false);
  assert.equal(isValidTxHash(12345678), false);
  assert.equal(isValidTxHash('0x' + 'a'.repeat(64) + ' not-a-hash'), false);
  assert.equal(isValidTxHash('hash with spaces'), false);
  assert.equal(isValidTxHash('a'.repeat(129)), false);
});

test('normalizeNetwork trims and collapses whitespace', () => {
  assert.equal(normalizeNetwork('  USDT   (TRC-20) '), 'USDT (TRC-20)');
  assert.equal(normalizeNetwork(null), '');
});

test('isValidNetwork accepts readable labels and rejects junk', () => {
  assert.equal(isValidNetwork('USDT (TRC-20)'), true);
  assert.equal(isValidNetwork('Ethereum mainnet'), true);
  assert.equal(isValidNetwork('BTC'), true);
  assert.equal(isValidNetwork(''), false);
  assert.equal(isValidNetwork('   '), false);
  assert.equal(isValidNetwork('-leading-dash'), false);
  assert.equal(isValidNetwork('x'.repeat(61)), false);
  assert.equal(isValidNetwork(null), false);
});
