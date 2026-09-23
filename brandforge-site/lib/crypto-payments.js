'use strict';

// Validation helpers for the admin-verified crypto escrow flow.
//
// A client funds an agreement by sending crypto to the BrandForge deposit wallet and pasting
// the transaction hash. These helpers decide whether a submitted hash / network label is
// plausible enough to record for manual on-chain verification. They intentionally stay
// dependency-free and CommonJS so node:test can exercise them directly.

const TX_HASH_MIN_LENGTH = 8;
const TX_HASH_MAX_LENGTH = 128;
// Covers hex hashes (BTC/EVM/Tron) and base58 hashes (Solana). Anything else is not a hash.
const TX_HASH_PATTERN = /^[A-Za-z0-9]+$/;

const NETWORK_MAX_LENGTH = 60;
// Human-readable labels like "USDT (TRC-20)" or "Ethereum mainnet".
const NETWORK_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()/+-]*$/;

function normalizeTxHash(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidTxHash(value) {
  const hash = normalizeTxHash(value);
  return (
    hash.length >= TX_HASH_MIN_LENGTH &&
    hash.length <= TX_HASH_MAX_LENGTH &&
    TX_HASH_PATTERN.test(hash)
  );
}

function normalizeNetwork(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
}

function isValidNetwork(value) {
  const network = normalizeNetwork(value);
  return network.length > 0 && network.length <= NETWORK_MAX_LENGTH && NETWORK_PATTERN.test(network);
}

module.exports = {
  TX_HASH_MIN_LENGTH,
  TX_HASH_MAX_LENGTH,
  NETWORK_MAX_LENGTH,
  normalizeTxHash,
  isValidTxHash,
  normalizeNetwork,
  isValidNetwork,
};
