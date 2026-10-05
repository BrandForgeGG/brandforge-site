const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  createSessionToken,
  verifySessionToken,
  hashIp,
  consumeQuota,
  consumeChatQuota,
  sessionCookieOptions,
} = require('./blueprint-session.js');

const SECRET = 'test-secret';
const ID = randomUUID();

test('a minted token round-trips back to the same session id', () => {
  const token = createSessionToken(ID, SECRET);
  assert.equal(token.includes(ID), true);
  assert.equal(verifySessionToken(token, SECRET), ID);
});

test('minting rejects a non-uuid id and a missing secret', () => {
  assert.throws(() => createSessionToken('not-a-uuid', SECRET), /uuid/);
  assert.throws(() => createSessionToken(ID, ''), /secret/);
});

test('tampering with either half of the token fails closed', () => {
  const token = createSessionToken(ID, SECRET);
  const [id, sig] = token.split('.');
  const other = randomUUID();

  assert.equal(verifySessionToken(`${other}.${sig}`, SECRET), null, 'swapped id');
  assert.equal(verifySessionToken(`${id}.AAAA${sig.slice(4)}`, SECRET), null, 'swapped sig');
  assert.equal(verifySessionToken(id, SECRET), null, 'no signature');
  assert.equal(verifySessionToken(`${id}.`, SECRET), null, 'empty signature');
  assert.equal(verifySessionToken('', SECRET), null, 'empty token');
  assert.equal(verifySessionToken(null, SECRET), null, 'null token');
});

test('a valid token from another secret does not verify', () => {
  const token = createSessionToken(ID, 'other-secret');
  assert.equal(verifySessionToken(token, SECRET), null);
  assert.equal(verifySessionToken(token, ''), null);
  assert.equal(verifySessionToken(token, undefined), null);
});

test('hostile tokens are rejected before any database work', () => {
  assert.equal(verifySessionToken('../../etc/passwd.x', SECRET), null);
  assert.equal(verifySessionToken(`${randomUUID()}.short`, SECRET), null);
  assert.equal(verifySessionToken('DROP TABLE blueprints.abc', SECRET), null);
});

test('the ip hash is stable, salted and non-reversible', () => {
  const a = hashIp('203.0.113.9', SECRET);
  assert.equal(a, hashIp('203.0.113.9', SECRET));
  assert.notEqual(a, hashIp('203.0.113.10', SECRET));
  assert.notEqual(a, hashIp('203.0.113.9', 'other'));
  assert.equal(a.includes('203.0.113.9'), false);
  assert.equal(a.length, 32);
  assert.equal(hashIp('  ', SECRET), null);
  assert.equal(hashIp('', SECRET), null);
  assert.equal(hashIp(null, SECRET), null);
  assert.equal(hashIp('1.2.3.4', ''), null);
});

test('the quota rolls over on the UTC day and blocks at the limit', () => {
  const limit = 3;
  const day = Date.UTC(2026, 9, 4, 12, 0, 0);
  let session = { quota_date: '2026-10-04', quota_count: 0 };

  const first = consumeQuota(session, { limit, now: day });
  assert.deepEqual(first, { allowed: true, quotaDate: '2026-10-04', quotaCount: 1, remaining: 2 });
  session = { quota_date: first.quotaDate, quota_count: first.quotaCount };

  const second = consumeQuota(session, { limit, now: day });
  assert.equal(second.allowed, true);
  assert.equal(second.quotaCount, 2);
  session = { quota_date: second.quotaDate, quota_count: second.quotaCount };

  const third = consumeQuota(session, { limit, now: day });
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
  session = { quota_date: third.quotaDate, quota_count: third.quotaCount };

  const fourth = consumeQuota(session, { limit, now: day });
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.quotaCount, 3, 'a blocked run does not increment the stored count');
  assert.equal(fourth.remaining, 0);
});

test('the quota resets when the day changes or the session is fresh', () => {
  const yesterday = { quota_date: '2026-10-03', quota_count: 99 };
  const rolled = consumeQuota(yesterday, { limit: 10, now: Date.UTC(2026, 9, 4) });
  assert.equal(rolled.allowed, true);
  assert.equal(rolled.quotaCount, 1);

  const fresh = consumeQuota(null, { limit: 10, now: Date.UTC(2026, 9, 4) });
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.quotaCount, 1);

  const junk = consumeQuota({ quota_date: '2026-10-04', quota_count: 'NaN' }, { limit: 5 });
  assert.equal(junk.allowed, true, 'a corrupt count must not lock a visitor out');
  assert.equal(junk.quotaCount, 1);
});

test('the chat quota rolls independently of the blueprint run quota', () => {
  const day = Date.UTC(2026, 9, 4, 12, 0, 0);

  // Blueprint runs already burned the whole daily run quota: chat must not care.
  const session = {
    quota_date: '2026-10-04',
    quota_count: 99,
    chat_quota_date: '2026-10-04',
    chat_quota_count: 1,
  };
  const next = consumeChatQuota(session, { limit: 3, now: day });
  assert.deepEqual(next, { allowed: true, quotaDate: '2026-10-04', quotaCount: 2, remaining: 1 });

  const blocked = consumeChatQuota({ ...session, chat_quota_count: 3 }, { limit: 3, now: day });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.quotaCount, 3, 'a blocked turn does not increment the stored count');

  // Chat counters reset on a new UTC day even when the run counters are stale.
  const rolled = consumeChatQuota(
    { chat_quota_date: '2026-10-03', chat_quota_count: 99 },
    { limit: 3, now: day }
  );
  assert.equal(rolled.allowed, true);
  assert.equal(rolled.quotaCount, 1);

  // A visitor with blueprint runs recorded but no chat columns yet (0023 pending).
  const legacy = consumeChatQuota({ quota_date: '2026-10-04', quota_count: 5 }, { limit: 3, now: day });
  assert.equal(legacy.allowed, true, 'missing chat columns must not lock a visitor out');
  assert.equal(legacy.quotaCount, 1);
});

test('the cookie is HttpOnly, path-wide and Secure only in production', () => {
  const prod = sessionCookieOptions(7, true);
  assert.equal(prod.httpOnly, true);
  assert.equal(prod.secure, true);
  assert.equal(prod.sameSite, 'lax');
  assert.equal(prod.path, '/');
  assert.equal(prod.maxAge, 7 * 86400);

  const dev = sessionCookieOptions(7, false);
  assert.equal(dev.secure, false);
  assert.equal(sessionCookieOptions(0, false).maxAge, 86400, 'ttl never collapses to a session cookie');
});
