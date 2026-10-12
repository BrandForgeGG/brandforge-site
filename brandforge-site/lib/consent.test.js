'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readConsent, consentCookie, analyticsAllowed } = require('./consent.js');

test('no cookie, or a foreign one, means no choice yet', () => {
  assert.equal(readConsent(''), null);
  assert.equal(readConsent(undefined), null);
  assert.equal(readConsent('a=1; b=2'), null);
});

test('reads the choice among other cookies', () => {
  assert.equal(readConsent('a=1; bf_consent=all; b=2'), 'all');
  assert.equal(readConsent('bf_consent=essential'), 'essential');
});

test('an unknown value is treated as no choice', () => {
  assert.equal(readConsent('bf_consent=maybe'), null);
});

test('measurement runs only after an explicit yes', () => {
  assert.equal(analyticsAllowed(''), false);
  assert.equal(analyticsAllowed('bf_consent=essential'), false);
  assert.equal(analyticsAllowed('bf_consent=all'), true);
});

test('the cookie string is scoped, long-lived and Secure only on https', () => {
  const on = consentCookie('all', true);
  assert.match(on, /^bf_consent=all; Path=\/; Max-Age=\d+; SameSite=Lax; Secure$/);
  assert.doesNotMatch(consentCookie('essential', false), /Secure/);
  assert.match(consentCookie('whatever', false), /^bf_consent=essential/);
});
