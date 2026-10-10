// Identity layer for Pillar A: every person is a person.
//
// Pure, dependency-free helpers (CommonJS so node:test covers them without Supabase) for:
// - public sequential display ids (#1, #2, #3...) independent of the auth UUID
// - usernames: the handle shown on the profile card, unique across the platform
// - the one-time token behind Telegram deep-link ownership verification
//
// Rules encoded here rather than in the UI so the API, the settings page and the bot flow
// all agree on what a legal username or token is.

import crypto from 'node:crypto';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

// Reserved because they impersonate the product or collide with routing/roles.
export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'brandforge',
  'support',
  'help',
  'api',
  'system',
  'root',
  'staff',
  'team',
  'official',
  'me',
  'settings',
  'login',
  'signup',
  'chat',
  'new',
  'apply',
  'telegram',
]);

// Letter/digit/underscore/period, must start and end alphanumeric. Keeps handles typeable,
// URL-safe and unambiguous when rendered next to #12 on a profile card.
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._]{1,22})[a-z0-9]$/;

export function normalizeUsername(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
}

/**
 * @typedef {{ ok: true, username: string }
 *   | { ok: false, reason: string }} UsernameValidation
 */

/**
 * Returns { ok: true, username } or { ok: false, reason } with a founder-readable reason.
 * @param {unknown} value
 * @returns {UsernameValidation}
 */
export function validateUsername(value) {
  const username = normalizeUsername(value);

  if (!username) {
    return { ok: false, reason: 'Pick a username.' };
  }

  if (username.length < USERNAME_MIN) {
    return { ok: false, reason: `Usernames need at least ${USERNAME_MIN} characters.` };
  }

  if (username.length > USERNAME_MAX) {
    return { ok: false, reason: `Usernames can be at most ${USERNAME_MAX} characters.` };
  }

  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, reason: 'That username is reserved.' };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      reason:
        'Use letters, numbers, dots or underscores, starting and ending with a letter or number.',
    };
  }

  // A username that reads like a number would be confused with the public display id.
  if (/^\d+$/.test(username)) {
    return { ok: false, reason: 'Usernames cannot be only numbers.' };
  }

  return { ok: true, username };
}

// The public id is a number, not a string: it is sequential and never reused.
export function formatDisplayId(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 1) {
    return '#—';
  }

  return `#${Math.floor(numeric)}`;
}

// Roles stay on the profile card as a badge — never in the message author line.
export const ROLE_BADGES = {
  admin: 'Admin',
  operator: 'BrandForge team',
  designer: 'BrandForge team',
  client: 'Founder',
  viewer: 'Member',
  founder: 'Founder',
  builder: 'BrandForge team',
  observer: 'Observer',
};

export function roleBadge(role) {
  const key = String(role ?? '').trim().toLowerCase();
  return ROLE_BADGES[key] || 'Member';
}

const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'; // no look-alike characters

// Random, URL-safe, and long enough that a token cannot be guessed from another one.
export function createLinkToken(randomValues) {
  let out = '';

  for (let i = 0; i < 32; i += 1) {
    if (randomValues && i < randomValues.length) {
      out += randomValues[i];
      continue;
    }
    const randomBytes = crypto.randomBytes(1);
    out += TOKEN_ALPHABET[randomBytes[0] % TOKEN_ALPHABET.length];
  }

  return out;
}

// Telegram deep link: https://t.me/<bot>?start=<one-time-token>
export function buildTelegramDeepLink(botUsername, token) {
  const bot = String(botUsername ?? '')
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\/t\.me\//i, '');

  if (!bot) {
    return '';
  }

  if (!token) {
    return `https://t.me/${bot}`;
  }

  return `https://t.me/${bot}?start=${encodeURIComponent(String(token))}`;
}

// Normalizes what the bot hands back: Telegram usernames are @-prefixed by convention but the
// API returns them bare, and users paste either form.
export function normalizeTelegramUsername(value) {
  const username = String(value ?? '')
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\/t\.me\//i, '');

  return /^[a-z0-9_]{4,32}$/i.test(username) ? username : '';
}

export function isTelegramChatId(value) {
  // Telegram chat ids are integers, optionally negative for groups/supergroups/channels.
  return /^-?\d{1,20}$/.test(String(value ?? '').trim());
}

// ---------- one-time Telegram link codes (paste-into-bot flow) ----------
//
// Telegram caps the ?start= deep-link payload at 64 bytes, which cannot hold a signed
// token, so the app shows a short code instead: the member opens the bot and pastes
// the code, and the bot confirms it against this account. The code is a truncated HMAC
// over the user id and a 15-minute time bucket, so nothing has to be stored, it dies on
// its own, and guessing one code anywhere in the member list inside a single bucket
// window is infeasible (40 bits of code, verified against every account in one pass).

export const LINK_CODE_LENGTH = 8;
export const LINK_CODE_BUCKET_SECONDS = 15 * 60;

// Lowercase, alphanumeric only: humans paste with stray spaces, dashes and capitals.
export function normalizeLinkCode(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function linkCodeFor(userId, bucket, key) {
  const digest = crypto.createHmac('sha256', key).update(`${userId}.${bucket}`).digest();
  let out = '';
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) {
    out += TOKEN_ALPHABET[digest[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

function linkCodeBucket(nowMs) {
  return Math.floor((Number(nowMs) || Date.now()) / 1000 / LINK_CODE_BUCKET_SECONDS);
}

// Returns an 8-character code for this user in the current bucket, or null without a secret.
export function createTelegramLinkCode(userId, secret, nowMs) {
  const key = String(secret ?? '').trim();
  const id = String(userId ?? '').trim();

  if (!key || !id) {
    return null;
  }

  return linkCodeFor(id, linkCodeBucket(nowMs), key);
}

/**
 * @typedef {{ ok: true, userId: string }
 *   | { ok: false, reason: string }} TelegramLinkCodeVerification
 */

// Verifies a pasted code against the list of member ids. Checks the current and the
// previous bucket so a code keeps working across a boundary, and walks the whole
// candidate list without an early return so timing does not reveal where a match sat.
/**
 * @param {unknown} code
 * @param {string[]} candidateUserIds
 * @param {string | undefined} secret
 * @param {number} [nowMs]
 * @returns {TelegramLinkCodeVerification}
 */
export function verifyTelegramLinkCode(code, candidateUserIds, secret, nowMs) {
  const key = String(secret ?? '').trim();

  if (!key) {
    return { ok: false, reason: 'not_configured' };
  }

  const normalized = normalizeLinkCode(code);

  if (normalized.length !== LINK_CODE_LENGTH) {
    return { ok: false, reason: 'malformed_code' };
  }

  const bucket = linkCodeBucket(nowMs);
  const candidates = Array.isArray(candidateUserIds) ? candidateUserIds : [];
  let match = '';

  for (const userId of candidates) {
    const id = String(userId ?? '').trim();
    if (!id) continue;

    if (safeEqual(linkCodeFor(id, bucket, key), normalized)) {
      match = id;
    } else if (safeEqual(linkCodeFor(id, bucket - 1, key), normalized)) {
      match = id;
    }
  }

  if (!match) {
    return { ok: false, reason: 'unknown_code' };
  }

  return { ok: true, userId: match };
}

// ---------- one-time Telegram link tokens ----------
//
// The deep link carries a stateless token instead of a database row: the user id and
// an expiry are HMAC-signed with the app secret, so nothing needs migrating, a token
// cannot be forged, and an old token stops working on its own. Encoding is base64url
// (the same alphabet the Supabase cookie helpers already use here) and the comparison
// is timing-safe, so verification neither leaks the secret nor depends on a lookup.

export const LINK_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes is long enough to open Telegram, short enough to expire.
export const LINK_TOKEN_SEGMENT_SEPARATOR = '.';

export function base64UrlEncode(value) {
  return Buffer.from(String(value), 'utf8').toString('base64url');
}

export function base64UrlDecode(value) {
  return Buffer.from(String(value), 'base64url').toString('utf8');
}

// Constant-time string compare that does not leak length through an early return.
export function safeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');

  // timingSafeEqual requires equal lengths, so hash both sides first: the digest is a
  // fixed width, which keeps the comparison constant-time for inputs of any length.
  const leftDigest = crypto.createHash('sha256').update(left).digest();
  const rightDigest = crypto.createHash('sha256').update(right).digest();

  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

// Signs a token for one user. Returns null when no secret is configured, because a token
// signed with a guessable key would be worse than no token at all.
export function createTelegramLinkToken(userId, secret, nowMs) {
  const key = String(secret ?? '').trim();

  if (!key) {
    return null;
  }

  const id = String(userId ?? '').trim();

  if (!id) {
    return null;
  }

  const expiresAt = Math.floor((Number(nowMs) || Date.now()) / 1000) + LINK_TOKEN_TTL_SECONDS;
  const payload = base64UrlEncode(`${id}.${expiresAt}`);
  const signature = crypto.createHmac('sha256', key).update(payload).digest('base64url');

  return `${payload}${LINK_TOKEN_SEGMENT_SEPARATOR}${signature}`;
}

/**
 * @typedef {{ ok: true, userId: string }
 *   | { ok: false, reason: string }} TelegramLinkVerification
 */

// Verifies a token came from us, has not expired, and is bound to one user.
/**
 * @param {unknown} token
 * @param {string | undefined} secret
 * @param {number} [nowMs]
 * @returns {TelegramLinkVerification}
 */
export function verifyTelegramLinkToken(token, secret, nowMs) {
  const key = String(secret ?? '').trim();
  const raw = String(token ?? '').trim();

  if (!key) {
    return { ok: false, reason: 'not_configured' };
  }

  if (!raw) {
    return { ok: false, reason: 'empty_token' };
  }

  const parts = raw.split(LINK_TOKEN_SEGMENT_SEPARATOR);

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed_token' };
  }

  const [payload, signature] = parts;
  const expected = crypto.createHmac('sha256', key).update(payload).digest('base64url');

  if (!safeEqual(expected, signature)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let decoded = '';

  try {
    decoded = base64UrlDecode(payload);
  } catch {
    return { ok: false, reason: 'malformed_token' };
  }

  const [userId, expiresAtRaw] = decoded.split('.');
  const expiresAt = Number(expiresAtRaw);

  if (!userId || !Number.isFinite(expiresAt)) {
    return { ok: false, reason: 'malformed_token' };
  }

  // A uuid, not an arbitrary string: the token is signed, but this keeps the value that
  // reaches the database query constrained even if the signing secret were ever weakened.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return { ok: false, reason: 'malformed_token' };
  }

  const nowSeconds = Math.floor((Number(nowMs) || Date.now()) / 1000);

  if (nowSeconds >= expiresAt) {
    return { ok: false, reason: 'expired_token' };
  }

  return { ok: true, userId };
}

