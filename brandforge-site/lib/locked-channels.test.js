'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocked, lockedReason, donateUrl } = require('./locked-channels.js');

test('X is locked with a plain reason; working platforms are not', () => {
  assert.equal(isLocked('x'), true);
  assert.match(lockedReason('x'), /cannot afford/);
  assert.equal(isLocked('linkedin'), false);
  assert.equal(lockedReason('bluesky'), null);
  assert.equal(isLocked('toString'), false);
});

test('the donate link uses the configured https page, else the team chat', () => {
  assert.equal(donateUrl({ NEXT_PUBLIC_DONATE_URL: 'https://example.org/give' }), 'https://example.org/give');
  assert.equal(donateUrl({ NEXT_PUBLIC_DONATE_URL: 'javascript:alert(1)' }), 'https://t.me/headstartup');
  assert.equal(donateUrl({}), 'https://t.me/headstartup');
});
