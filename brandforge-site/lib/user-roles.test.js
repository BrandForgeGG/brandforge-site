const test = require('node:test');
const assert = require('node:assert/strict');

const { getUserRoleFromEmail, isFounderEmail } = require('./user-roles.js');

test('getUserRoleFromEmail maps privileged Google accounts and open signups', () => {
  assert.equal(getUserRoleFromEmail('brandforge.gg@gmail.com'), 'founder');
  assert.equal(getUserRoleFromEmail('mxstermind.com@gmail.com'), 'operator');
  assert.equal(getUserRoleFromEmail('MXSTERMIND.COM@GMAIL.COM'), 'operator');
  assert.equal(getUserRoleFromEmail('someone.new@gmail.com'), 'user');
  assert.equal(getUserRoleFromEmail(''), 'guest');
});

test('the removed demo account no longer maps to a privileged role', () => {
  assert.equal(getUserRoleFromEmail('demo@brandforge.gg'), 'user');
  assert.equal(isFounderEmail('demo@brandforge.gg'), false);
});

test('isFounderEmail only matches the founder account', () => {
  assert.equal(isFounderEmail('brandforge.gg@gmail.com'), true);
  assert.equal(isFounderEmail('mxstermind.com@gmail.com'), false);
  assert.equal(isFounderEmail('someone.new@gmail.com'), false);
});
