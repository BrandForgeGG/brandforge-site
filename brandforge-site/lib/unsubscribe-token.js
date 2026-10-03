'use strict';

// Long-lived unsubscribe tokens for product-update emails.
//
// Format: base64url(user_id) + '.' + truncated HMAC-SHA256. The key is the
// Supabase service-role key, which exists in every environment that can send
// email at all, so this needs no new secret. Tokens never expire (they live in
// old emails) and reveal nothing but the user id, which the API needs anyway
// to flip `profiles.marketing_opt_in` to false.

const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hmacKey() {
  return (
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '').trim() || null
  );
}

function sign(idPart) {
  return crypto.createHmac('sha256', hmacKey()).update(`unsub:${idPart}`).digest('base64url').slice(0, 32);
}

// Returns a token for the user, or null when no key is configured / the id is
// not a uuid. Callers skip the unsubscribe link instead of emitting a broken one.
function makeUnsubscribeToken(userId) {
  const key = hmacKey();
  if (!key || typeof userId !== 'string' || !UUID.test(userId)) return null;
  const idPart = Buffer.from(userId.toLowerCase(), 'utf8').toString('base64url');
  return `${idPart}.${sign(idPart)}`;
}

// Verifies a token and returns the user id it was minted for, or null.
function readUnsubscribeToken(token) {
  const key = hmacKey();
  if (!key || typeof token !== 'string' || token.length > 200) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const idPart = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = sign(idPart);
  const givenBuf = Buffer.from(given);
  const expectedBuf = Buffer.from(expected);
  if (givenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(givenBuf, expectedBuf)) {
    return null;
  }
  let userId;
  try {
    userId = Buffer.from(idPart, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  return UUID.test(userId) ? userId.toLowerCase() : null;
}

module.exports = { makeUnsubscribeToken, readUnsubscribeToken };
