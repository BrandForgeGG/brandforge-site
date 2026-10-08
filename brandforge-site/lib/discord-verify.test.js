'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyDiscordSignature } = require('./discord-verify');

function keypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  return { raw, privateKey };
}

test('a correctly signed interaction verifies; tampering or a wrong key does not', () => {
  const { raw, privateKey } = keypair();
  const timestamp = '1700000000';
  const rawBody = JSON.stringify({ type: 1 });
  const signatureHex = crypto.sign(null, Buffer.from(timestamp + rawBody), privateKey).toString('hex');

  assert.equal(verifyDiscordSignature({ publicKeyHex: raw, signatureHex, timestamp, rawBody }), true);
  assert.equal(verifyDiscordSignature({ publicKeyHex: raw, signatureHex, timestamp, rawBody: rawBody + ' ' }), false);
  assert.equal(verifyDiscordSignature({ publicKeyHex: raw, signatureHex, timestamp: '1700000001', rawBody }), false);
  assert.equal(verifyDiscordSignature({ publicKeyHex: keypair().raw, signatureHex, timestamp, rawBody }), false);
});

test('missing or malformed inputs are rejected, never thrown', () => {
  assert.equal(verifyDiscordSignature({}), false);
  assert.equal(verifyDiscordSignature({ publicKeyHex: 'zz', signatureHex: 'zz', timestamp: '1', rawBody: '{}' }), false);
});
