'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isTestEmail, isRealActor, allReal } = require('./real-activity');

test('throwaway and example addresses are test accounts', () => {
  for (const email of ['probe-payer-1791@brandforge.gg', 'demo-worker-1@brandforge.gg', 'test.user@gmail.com', 'e2e-1@x.io', 'someone@example.com', 'qa_bot@gmail.com']) {
    assert.equal(isTestEmail(email, {}), true, email);
  }
  for (const email of ['maya.chen@gmail.com', 'attest@gmail.com', 'contest-winner@gmail.com', '', null]) {
    assert.equal(isTestEmail(email, {}), false, String(email));
  }
});

test('an extra list of test addresses comes from the environment', () => {
  assert.equal(isTestEmail('founder.second@gmail.com', { TEST_ACCOUNT_EMAILS: 'Founder.Second@gmail.com, other@x.io' }), true);
  assert.equal(isTestEmail('founder.second@gmail.com', {}), false);
});

test('staff, test traffic and test accounts are never real; guests and members are', () => {
  assert.equal(isRealActor({ email: 'a@gmail.com', role: 'admin' }, {}), false);
  assert.equal(isRealActor({ email: 'a@gmail.com', role: 'operator' }, {}), false);
  assert.equal(isRealActor({ source: 'test' }, {}), false);
  assert.equal(isRealActor({ email: 'probe-1@brandforge.gg', role: 'user' }, {}), false);
  assert.equal(isRealActor({ email: 'maya@gmail.com', role: 'user', source: 'organic' }, {}), true);
  assert.equal(isRealActor({}, {}), true, 'a guest has no email or role');
  assert.equal(isRealActor(null, {}), true);
});

test('an event with a test participant is not announced', () => {
  assert.equal(allReal([{ email: 'maya@gmail.com' }, { email: 'demo-1@brandforge.gg' }], {}), false);
  assert.equal(allReal([{ email: 'maya@gmail.com' }, { email: 'leo@gmail.com' }], {}), true);
  assert.equal(allReal([], {}), true);
});
