'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeUsername,
  validateUsername,
  formatDisplayId,
  roleBadge,
  createLinkToken,
  createTelegramLinkToken,
  verifyTelegramLinkToken,
  LINK_TOKEN_TTL_SECONDS,
  buildTelegramDeepLink,
  normalizeTelegramUsername,
  isTelegramChatId,
  RESERVED_USERNAMES,
} = require('./identity.js');

test('normalizeUsername trims, lowercases and drops a leading @', () => {
  assert.equal(normalizeUsername('  @Ada.Lovelace '), 'ada.lovelace');
  assert.equal(normalizeUsername('@@ada'), 'ada');
  assert.equal(normalizeUsername(null), '');
});

test('validateUsername accepts ordinary handles', () => {
  const result = validateUsername('Ada.Lovelace');
  assert.equal(result.ok, true);
  assert.equal(result.username, 'ada.lovelace');
  assert.equal(validateUsername('ada').ok, true);
  assert.equal(validateUsername('a_b').ok, true);
});

test('validateUsername rejects empty, too short and too long input', () => {
  assert.equal(validateUsername('').ok, false);
  assert.equal(validateUsername('   ').ok, false);
  assert.equal(validateUsername('ab').ok, false);
  assert.equal(validateUsername('a'.repeat(25)).ok, false);
});

test('validateUsername rejects illegal characters and bad edges', () => {
  assert.equal(validateUsername('ada lovelace').ok, false);
  assert.equal(validateUsername('ada@forge').ok, false);
  assert.equal(validateUsername('_ada').ok, false);
  assert.equal(validateUsername('ada_').ok, false);
  assert.equal(validateUsername('.ada').ok, false);
});

test('validateUsername rejects reserved names that would impersonate the product', () => {
  for (const reserved of RESERVED_USERNAMES) {
    const result = validateUsername(reserved);
    assert.equal(result.ok, false, `${reserved} should be reserved`);
  }
});

test('validateUsername rejects all-numeric handles so they cannot be confused with #id', () => {
  const result = validateUsername('12345');
  assert.equal(result.ok, false);
  assert.match(result.reason, /only numbers/i);
});

test('formatDisplayId renders a sequential public id', () => {
  assert.equal(formatDisplayId(1), '#1');
  assert.equal(formatDisplayId(42), '#42');
  assert.equal(formatDisplayId('7'), '#7');
});

test('formatDisplayId degrades safely on missing or invalid ids', () => {
  assert.equal(formatDisplayId(null), '#—');
  assert.equal(formatDisplayId(undefined), '#—');
  assert.equal(formatDisplayId(0), '#—');
  assert.equal(formatDisplayId('abc'), '#—');
  assert.equal(formatDisplayId(-3), '#—');
});

test('roleBadge maps roles to human labels and never leaks a raw enum', () => {
  assert.equal(roleBadge('admin'), 'Admin');
  assert.equal(roleBadge('operator'), 'Operator');
  assert.equal(roleBadge('client'), 'Founder');
  assert.equal(roleBadge('ADMIN'), 'Admin');
  assert.equal(roleBadge('viewer'), 'Member');
  assert.equal(roleBadge(null), 'Member');
  assert.equal(roleBadge('something_new'), 'Member');
});

test('createLinkToken seeds from injected values and is unambiguous otherwise', () => {
  assert.ok(createLinkToken(['a', 'b', 'c']).startsWith('abc'));
  const token = createLinkToken();
  assert.equal(token.length, 32);
  // No 0/O/1/l/I — the alphabet is deliberately look-alike free.
  assert.match(token, /^[a-z2-9]+$/);
});

test('buildTelegramDeepLink normalizes the bot handle and attaches the token', () => {
  assert.equal(
    buildTelegramDeepLink('@brandforge_bot', 'abc123'),
    'https://t.me/brandforge_bot?start=abc123'
  );
  assert.equal(
    buildTelegramDeepLink('https://t.me/brandforge_bot', 'abc123'),
    'https://t.me/brandforge_bot?start=abc123'
  );
  assert.equal(buildTelegramDeepLink('', 'abc'), '');
  assert.equal(buildTelegramDeepLink('brandforge_bot'), 'https://t.me/brandforge_bot');
});

test('normalizeTelegramUsername accepts bare and @-prefixed handles, rejects junk', () => {
  assert.equal(normalizeTelegramUsername('@ada_bot'), 'ada_bot');
  assert.equal(normalizeTelegramUsername('ada_bot'), 'ada_bot');
  assert.equal(normalizeTelegramUsername('https://t.me/ada_bot'), 'ada_bot');
  assert.equal(normalizeTelegramUsername('no'), '');
  assert.equal(normalizeTelegramUsername('has space'), '');
});

test('isTelegramChatId accepts personal and group ids, rejects text', () => {
  assert.equal(isTelegramChatId('123456789'), true);
  assert.equal(isTelegramChatId('-1004297341298'), true);
  assert.equal(isTelegramChatId('@ada'), false);
  assert.equal(isTelegramChatId(''), false);
});

// ---------- one-time Telegram link tokens ----------

const SECRET = 'test-signing-secret';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const NOW = 1_700_000_000_000; // fixed clock so expiry is deterministic

test('a signed link token verifies back to its own user', () => {
  const token = createTelegramLinkToken(USER_ID, SECRET, NOW);
  assert.ok(token);

  const result = verifyTelegramLinkToken(token, SECRET, NOW + 1000);
  assert.equal(result.ok, true);
  assert.equal(result.userId, USER_ID);
});

test('a link token is url-safe and carries no raw separators', () => {
  const token = createTelegramLinkToken(USER_ID, SECRET, NOW);
  // base64url alphabet only: safe to pass through a query string untouched.
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(token.includes('+'), false);
  assert.equal(token.includes('/'), false);
});

test('a token signed with a different secret is rejected', () => {
  const token = createTelegramLinkToken(USER_ID, SECRET, NOW);
  const result = verifyTelegramLinkToken(token, 'a-different-secret', NOW);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad_signature');
});

test('a tampered payload is rejected even with a valid-looking shape', () => {
  const token = createTelegramLinkToken(USER_ID, SECRET, NOW);
  const [payload, signature] = token.split('.');

  // Swap in a different user's id while keeping the original signature.
  const forged = Buffer.from(`${'99999999-2222-3333-4444-555555555555'}.${Math.floor(NOW / 1000) + LINK_TOKEN_TTL_SECONDS}`).toString('base64url');

  const result = verifyTelegramLinkToken(`${forged}.${signature}`, SECRET, NOW);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad_signature');
  assert.ok(payload.length > 0);
});

test('an expired token is rejected', () => {
  const token = createTelegramLinkToken(USER_ID, SECRET, NOW);
  const later = NOW + (LINK_TOKEN_TTL_SECONDS + 60) * 1000;

  const result = verifyTelegramLinkToken(token, SECRET, later);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'expired_token');
});

test('a token that expires exactly now is already dead', () => {
  const token = createTelegramLinkToken(USER_ID, SECRET, NOW);
  const exactly = NOW + LINK_TOKEN_TTL_SECONDS * 1000;

  // Boundary is exclusive so a token cannot be used in the same second it lapses.
  assert.equal(verifyTelegramLinkToken(token, SECRET, exactly).ok, false);
});

test('malformed and empty tokens are rejected without throwing', () => {
  for (const bad of ['', '   ', 'no-dot', 'a.b.c', '.', 'sig.', null, undefined, 12345]) {
    const result = verifyTelegramLinkToken(bad, SECRET, NOW);
    assert.equal(result.ok, false, `expected rejection for ${String(bad)}`);
  }
});

test('a correctly signed token with a non-uuid payload is still refused', () => {
  // The signature is valid, so this proves the uuid shape check is an independent guard.
  const crypto = require('node:crypto');
  const expiresAt = Math.floor(NOW / 1000) + LINK_TOKEN_TTL_SECONDS;
  const payload = Buffer.from(`not-a-uuid.${expiresAt}`).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

  const result = verifyTelegramLinkToken(`${payload}.${signature}`, SECRET, NOW);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed_token');
});

test('no token is minted without a secret, and none is accepted without one', () => {
  // A token signed with a guessable/absent key must never be issued.
  assert.equal(createTelegramLinkToken(USER_ID, '', NOW), null);
  assert.equal(createTelegramLinkToken(USER_ID, null, NOW), null);
  assert.equal(createTelegramLinkToken('', SECRET, NOW), null);

  const token = createTelegramLinkToken(USER_ID, SECRET, NOW);
  assert.equal(verifyTelegramLinkToken(token, '', NOW).reason, 'not_configured');
});

test('two users never receive the same token', () => {
  const a = createTelegramLinkToken(USER_ID, SECRET, NOW);
  const b = createTelegramLinkToken('66666666-2222-3333-4444-555555555555', SECRET, NOW);
  assert.notEqual(a, b);
});
