const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ADMIN_LOGIN_EMAILS,
  OPERATOR_LOGIN_EMAILS,
  isAdminLoginEmail,
  isOperatorLoginEmail,
  normalizeEmail,
} = require('./auth-allowlist.js');

test('admin and operator privileged lists are the expected accounts', () => {
  assert.deepEqual(ADMIN_LOGIN_EMAILS, ['brandforge.gg@gmail.com']);
  assert.deepEqual(OPERATOR_LOGIN_EMAILS, ['mxstermind.com@gmail.com']);
});

test('isOperatorLoginEmail matches the operator account case-insensitively', () => {
  assert.equal(isOperatorLoginEmail('mxstermind.com@gmail.com'), true);
  assert.equal(isOperatorLoginEmail('MXSTERMIND.COM@GMAIL.COM'), true);
  assert.equal(isOperatorLoginEmail('brandforge.gg@gmail.com'), false);
  assert.equal(isOperatorLoginEmail('someone@example.com'), false);
  assert.equal(isOperatorLoginEmail(null), false);
});

test('isAdminLoginEmail matches only the admin account', () => {
  assert.equal(isAdminLoginEmail('brandforge.gg@gmail.com'), true);
  assert.equal(isAdminLoginEmail('  BrandForge.GG@Gmail.com  '), true);
  assert.equal(isAdminLoginEmail('mxstermind.com@gmail.com'), false);
  assert.equal(isAdminLoginEmail('founder@gmail.com'), false);
  assert.equal(isAdminLoginEmail(''), false);
  assert.equal(isAdminLoginEmail(null), false);
  assert.equal(isAdminLoginEmail(undefined), false);
});

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Founder@Example.COM '), 'founder@example.com');
  assert.equal(normalizeEmail(null), '');
});
