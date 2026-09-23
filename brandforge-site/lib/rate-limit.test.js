const test = require('node:test');
const assert = require('node:assert/strict');

const { checkRateLimit, resetRateLimits } = require('./rate-limit.js');

test('allows requests under the limit and reports remaining budget', () => {
  resetRateLimits();
  const first = checkRateLimit('chat:user-1', { limit: 3, windowMs: 60_000 });
  const second = checkRateLimit('chat:user-1', { limit: 3, windowMs: 60_000 });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 1);
});

test('blocks requests over the limit with a retry hint', () => {
  resetRateLimits();
  for (let i = 0; i < 3; i += 1) {
    checkRateLimit('chat:user-2', { limit: 3, windowMs: 60_000 });
  }

  const blocked = checkRateLimit('chat:user-2', { limit: 3, windowMs: 60_000 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test('tracks keys independently', () => {
  resetRateLimits();
  checkRateLimit('chat:user-3', { limit: 1, windowMs: 60_000 });

  assert.equal(checkRateLimit('chat:user-3', { limit: 1, windowMs: 60_000 }).allowed, false);
  assert.equal(checkRateLimit('chat:user-4', { limit: 1, windowMs: 60_000 }).allowed, true);
});

test('window expiry restores the budget', async () => {
  resetRateLimits();
  checkRateLimit('chat:user-5', { limit: 1, windowMs: 30 });
  assert.equal(checkRateLimit('chat:user-5', { limit: 1, windowMs: 30 }).allowed, false);

  await new Promise((resolve) => setTimeout(resolve, 45));

  assert.equal(checkRateLimit('chat:user-5', { limit: 1, windowMs: 30 }).allowed, true);
});
