const test = require('node:test');
const assert = require('node:assert/strict');
const { canGenerate, accessState } = require('./ai-access');

test('the owner and admins can always generate', () => {
  assert.equal(canGenerate({ isOwner: true, isAdmin: false, status: null }), true);
  assert.equal(canGenerate({ isOwner: false, isAdmin: true, status: null }), true);
});

test('everyone else needs a granted request', () => {
  assert.equal(canGenerate({ isOwner: false, isAdmin: false, status: null }), false);
  assert.equal(canGenerate({ isOwner: false, isAdmin: false, status: 'requested' }), false);
  assert.equal(canGenerate({ isOwner: false, isAdmin: false, status: 'denied' }), false);
  assert.equal(canGenerate({ isOwner: false, isAdmin: false, status: 'granted' }), true);
  assert.equal(canGenerate(null), false);
});

test('the state a participant sees', () => {
  assert.equal(accessState({ isOwner: false, isAdmin: false, status: null }), 'none');
  assert.equal(accessState({ isOwner: false, isAdmin: false, status: 'requested' }), 'requested');
  assert.equal(accessState({ isOwner: false, isAdmin: false, status: 'denied' }), 'denied');
  assert.equal(accessState({ isOwner: false, isAdmin: false, status: 'granted' }), 'allowed');
});
