'use strict';

// Anonymous Blueprint Engine sessions (master brief 4.2/4.10).
//
// A session is an opaque random UUID carried in an HttpOnly cookie of the form
// `<id>.<hmac>` where the HMAC is SHA-256 over the id with a server-side
// secret. Verification is offline and constant-time, so a forged cookie is
// rejected before any database round trip, and a valid one costs zero lookups
// until the row is actually needed.
//
// Why not Supabase anonymous sign-ins: auth.users stays clean (no ghost
// accounts), nothing to purge from auth, and the merge into a real account
// later (S6) is a single UPDATE on merged_user_id.
//
// Everything here is dependency-free CJS so node:test can exercise the crypto
// and the quota maths directly.

const crypto = require('crypto');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hmac(value, secret) {
  return crypto.createHmac('sha256', String(secret)).update(String(value)).digest('base64url');
}

function createSessionToken(sessionId, secret) {
  const id = String(sessionId ?? '');
  if (!UUID_PATTERN.test(id)) {
    throw new Error('blueprint session id must be a uuid');
  }
  if (!secret) {
    throw new Error('missing blueprint session secret');
  }
  return `${id}.${hmac(id, secret)}`;
}

function verifySessionToken(token, secret) {
  if (!token || !secret) return null;
  const separator = String(token).lastIndexOf('.');
  if (separator <= 0) return null;

  const id = String(token).slice(0, separator);
  const signature = String(token).slice(separator + 1);
  if (!UUID_PATTERN.test(id)) return null;

  const expected = hmac(id, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths first —
  // the lengths are public (both base64url digests), so that leaks nothing.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

// Salted, truncated hash of the visitor IP: enough to count sessions per IP
// for the hourly limit, not reversible to an address without the secret.
function hashIp(ip, secret) {
  const value = String(ip ?? '').trim();
  if (!value || !secret) return null;
  return hmac(`bp-ip:${value}`, secret).slice(0, 32);
}

// Pure quota decision: the day rolls on UTC, the count starts over, the limit
// is per session per day (brief 4.10). Returns the values to persist when the
// run is allowed, or the current values when it is not.
function rollQuota(session, dateField, countField, { limit, now = Date.now() }) {
  const today = new Date(now).toISOString().slice(0, 10);
  const sameDay = session && session[dateField] === today;
  const used = sameDay ? Math.max(0, Number(session[countField]) || 0) : 0;

  if (used >= limit) {
    return { allowed: false, quotaDate: today, quotaCount: used, remaining: 0 };
  }
  return { allowed: true, quotaDate: today, quotaCount: used + 1, remaining: limit - (used + 1) };
}

function consumeQuota(session, options) {
  return rollQuota(session, 'quota_date', 'quota_count', options);
}

// Guest chat quota: same roll, separate counters (chat_quota_date/count on
// blueprint_sessions) so a blueprint run never eats the chat allowance and a
// chat turn never burns the blueprint run quota.
function consumeChatQuota(session, options) {
  return rollQuota(session, 'chat_quota_date', 'chat_quota_count', options);
}

// Cookie attributes for the bf_bp cookie: HttpOnly so script cannot read it,
// Secure in production, Lax so a top-level navigation carries it but cross-site
// POSTs do not, path-wide so every API route sees it.
function sessionCookieOptions(ttlDays, isSecure = process.env.NODE_ENV === 'production') {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(1, Math.floor(ttlDays)) * 86400,
  };
}

module.exports = {
  UUID_PATTERN,
  createSessionToken,
  verifySessionToken,
  hashIp,
  consumeQuota,
  consumeChatQuota,
  sessionCookieOptions,
};
