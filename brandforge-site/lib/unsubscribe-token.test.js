'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { makeUnsubscribeToken, readUnsubscribeToken } = require('./unsubscribe-token.js');

const KEY = 'test-service-role-key-for-unsub-tokens';
const UUID = '11111111-2222-4333-8444-555555555555';

test('token round-trips to the same user id', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
  try {
    const token = makeUnsubscribeToken(UUID);
    assert.ok(token, 'token minted');
    assert.equal(readUnsubscribeToken(token), UUID);
    // stable: same user, same token (emails may be resent)
    assert.equal(makeUnsubscribeToken(UUID), token);
  } finally {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});

test('tampered token is rejected', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
  try {
    const token = makeUnsubscribeToken(UUID);
    const [idPart, sig] = token.split('.');
    assert.equal(readUnsubscribeToken(`${idPart}.${sig.slice(0, -1)}x`), null, 'changed signature');
    assert.equal(readUnsubscribeToken(`aaaaaaaa-${sig}`), null, 'no dot');
    assert.equal(readUnsubscribeToken(''), null, 'empty');
    assert.equal(readUnsubscribeToken('nope.nope'), null, 'forged id part');
    assert.equal(readUnsubscribeToken(null), null, 'non-string');
    assert.equal(readUnsubscribeToken('a'.repeat(300)), null, 'oversized');
  } finally {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});

test('a token signed with a different key does not verify', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
  const token = makeUnsubscribeToken(UUID);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY + '-other';
  try {
    assert.equal(readUnsubscribeToken(token), null);
  } finally {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});

test('without any key nothing mints or verifies', () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  assert.equal(makeUnsubscribeToken(UUID), null);
  assert.equal(readUnsubscribeToken('x.y'), null);
});

test('non-uuid user ids never mint', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
  try {
    assert.equal(makeUnsubscribeToken('not-a-uuid'), null);
    assert.equal(makeUnsubscribeToken(''), null);
    assert.equal(makeUnsubscribeToken(null), null);
  } finally {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});
