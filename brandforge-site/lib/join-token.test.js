'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createJoinToken, verifyJoinToken } = require('./join-token');

const ID = '5c7df221-99be-4fd3-abef-036a7646edeb';

test('round-trips a conversation id', () => {
  const token = createJoinToken(ID, 's3cret');
  assert.equal(verifyJoinToken(token, 's3cret'), ID);
});

test('rejects a wrong secret, tampering and garbage', () => {
  const token = createJoinToken(ID, 's3cret');
  assert.equal(verifyJoinToken(token, 'other'), null);
  const [id, exp, mac] = token.split('.');
  const other = '11111111-1111-4111-8111-111111111111';
  assert.equal(verifyJoinToken([other, exp, mac].join('.'), 's3cret'), null);
  assert.equal(verifyJoinToken([id, String(Number(exp) + 99999), mac].join('.'), 's3cret'), null);
  assert.equal(verifyJoinToken('nope', 's3cret'), null);
  assert.equal(verifyJoinToken(null, 's3cret'), null);
});

test('expires', () => {
  const now = Date.now();
  const token = createJoinToken(ID, 's3cret', { ttlDays: 1, now });
  assert.equal(verifyJoinToken(token, 's3cret', now + 3600_000), ID);
  assert.equal(verifyJoinToken(token, 's3cret', now + 2 * 86400_000), null);
});

test('refuses to mint without a secret or a valid id', () => {
  assert.equal(createJoinToken(ID, ''), null);
  assert.equal(createJoinToken('not-a-uuid', 's3cret'), null);
});
