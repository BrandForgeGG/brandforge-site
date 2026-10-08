'use strict';

// Discord signs every interaction (slash command) request with Ed25519. Anything that does not
// verify against the application's public key is rejected before it is parsed.

const crypto = require('crypto');

// DER prefix that wraps a raw 32-byte Ed25519 public key as SubjectPublicKeyInfo.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function verifyDiscordSignature({ publicKeyHex, signatureHex, timestamp, rawBody }) {
  try {
    if (!publicKeyHex || !signatureHex || !timestamp) return false;
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, Buffer.from(String(timestamp) + String(rawBody)), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

module.exports = { verifyDiscordSignature };
