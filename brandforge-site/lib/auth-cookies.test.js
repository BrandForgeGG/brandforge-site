const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyCookieUpdates,
  isCookieDeletion,
  parseCookieHeader,
  sessionUserFromCookiePairs,
  stripAuthCookieDeletions,
} = require('./auth-cookies');

test('parseCookieHeader splits and decodes pairs', () => {
  const parsed = parseCookieHeader('a=1; sb-auth-token=eyJ%7Bx%7D; b=2');
  assert.deepEqual(parsed, [
    { name: 'a', value: '1' },
    { name: 'sb-auth-token', value: 'eyJ{x}' },
    { name: 'b', value: '2' },
  ]);
});

test('isCookieDeletion treats empty value and maxAge 0 as deletion', () => {
  assert.equal(isCookieDeletion({ name: 'x', value: '' }), true);
  assert.equal(isCookieDeletion({ name: 'x', value: 'v', options: { maxAge: 0 } }), true);
  assert.equal(isCookieDeletion({ name: 'x', value: 'v', options: { maxAge: 60 } }), false);
  assert.equal(isCookieDeletion({ name: 'x', value: 'v' }), false);
});

test('applyCookieUpdates merges refresh tokens into the raw header', () => {
  const raw = 'sb-auth-token-old=keep; other=1';
  const next = applyCookieUpdates(raw, [
    { name: 'sb-auth-token', value: 'rotated', options: { maxAge: 3600 } },
    { name: 'temp', value: '', options: { maxAge: 0 } },
  ]);

  assert.ok(next.includes('other=1'));
  assert.ok(next.includes('sb-auth-token=rotated'));
  assert.ok(!next.includes('temp='));
});

test('stripAuthCookieDeletions keeps the browser session when auth cookies existed', () => {
  const original = [
    { name: 'sb-auth-token', value: 'live-session' },
    { name: 'sb-refresh-token', value: 'live-refresh' },
  ];

  const stripped = stripAuthCookieDeletions(original, [
    { name: 'sb-auth-token', value: '', options: { maxAge: 0 } },
    { name: 'sb-refresh-token', value: 'new-refresh', options: { maxAge: 60 } },
    { name: 'verifier', value: '', options: { maxAge: 0 } },
  ]);

  assert.deepEqual(stripped, [
    { name: 'sb-auth-token', value: 'live-session', options: { maxAge: undefined } },
    { name: 'sb-refresh-token', value: 'new-refresh', options: { maxAge: 60 } },
    { name: 'verifier', value: '', options: { maxAge: 0 } },
  ]);
});

test('stripAuthCookieDeletions allows deletions when the request had no auth cookies', () => {
  const stripped = stripAuthCookieDeletions([], [
    { name: 'sb-auth-token', value: '', options: { maxAge: 0 } },
  ]);
  assert.deepEqual(stripped, [{ name: 'sb-auth-token', value: '', options: { maxAge: 0 } }]);
});

test('stripAuthCookieDeletions allows chunk rotation when refresh writes new auth cookies', () => {
  const original = [
    { name: 'sb-auth-token.0', value: 'old-chunk-0' },
    { name: 'sb-auth-token.1', value: 'old-chunk-1' },
  ];

  const updates = [
    { name: 'sb-auth-token.0', value: '', options: { maxAge: 0 } },
    { name: 'sb-auth-token.1', value: '', options: { maxAge: 0 } },
    { name: 'sb-auth-token', value: 'rotated-session', options: { maxAge: 3600 } },
  ];

  assert.deepEqual(stripAuthCookieDeletions(original, updates), updates);
});

test('stripAuthCookieDeletions still blocks wipe-only deletions with no auth writes', () => {
  const original = [{ name: 'sb-auth-token', value: 'live-session' }];
  const stripped = stripAuthCookieDeletions(original, [
    { name: 'sb-auth-token', value: '', options: { maxAge: 0 } },
  ]);

  assert.deepEqual(stripped, [
    { name: 'sb-auth-token', value: 'live-session', options: { maxAge: undefined } },
  ]);
});

function encodeBase64Cookie(session) {
  const json = JSON.stringify(session);
  return `base64-${Buffer.from(json, 'utf8').toString('base64url')}`;
}

test('sessionUserFromCookiePairs decodes base64url auth-token', () => {
  const session = {
    access_token: 'jwt',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: 'user-1',
      email: 'founder@example.com',
      user_metadata: { full_name: 'Founder' },
    },
  };

  const user = sessionUserFromCookiePairs([
    { name: 'sb-auth-token', value: encodeBase64Cookie(session) },
  ]);

  assert.equal(user.id, 'user-1');
  assert.equal(user.email, 'founder@example.com');
  assert.equal(user.user_metadata.full_name, 'Founder');
});

test('sessionUserFromCookiePairs rejoins chunked cookies', () => {
  const session = {
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-2', email: 'a@b.co' },
  };
  const encoded = encodeBase64Cookie(session);
  const mid = Math.ceil(encoded.length / 2);

  const user = sessionUserFromCookiePairs([
    { name: 'sb-auth-token.0', value: encoded.slice(0, mid) },
    { name: 'sb-auth-token.1', value: encoded.slice(mid) },
  ]);

  assert.equal(user.id, 'user-2');
});

test('sessionUserFromCookiePairs still returns identity when access token is expired', () => {
  const session = {
    expires_at: Math.floor(Date.now() / 1000) - 3600,
    user: { id: 'old-user', email: 'old@example.com' },
  };

  const user = sessionUserFromCookiePairs([
    { name: 'sb-auth-token', value: encodeBase64Cookie(session) },
  ]);

  assert.equal(user.id, 'old-user');
});

test('sessionUserFromCookiePairs returns null without auth cookies', () => {
  assert.equal(sessionUserFromCookiePairs([{ name: 'theme', value: 'dark' }]), null);
});
