'use strict';

// Signed team-invite tokens: `<conversationId>.<expiresAtSeconds>.<hmac>`.
// No table: the HMAC over id+expiry (server secret) is the whole proof, so an
// invite link can be minted by any participant and redeemed once the visitor
// is signed in. Verification is offline and constant-time.

const crypto = require('crypto');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TTL_DAYS = 14;

function sign(payload, secret) {
  return crypto.createHmac('sha256', String(secret)).update('join:' + payload).digest('base64url');
}

function createJoinToken(conversationId, secret, options = {}) {
  if (!secret || !UUID_PATTERN.test(String(conversationId))) return null;
  const ttlDays = options.ttlDays ?? DEFAULT_TTL_DAYS;
  const now = options.now ?? Date.now();
  const expires = Math.floor(now / 1000) + Math.round(ttlDays * 86400);
  const payload = conversationId + '.' + expires;
  return payload + '.' + sign(payload, secret);
}

// Returns the conversation id, or null for anything forged, malformed or expired.
function verifyJoinToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [conversationId, expires, mac] = parts;
  if (!UUID_PATTERN.test(conversationId) || !/^\d{1,12}$/.test(expires)) return null;
  const expected = Buffer.from(sign(conversationId + '.' + expires, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (Number(expires) * 1000 < now) return null;
  return conversationId;
}

module.exports = { createJoinToken, verifyJoinToken, DEFAULT_TTL_DAYS };
