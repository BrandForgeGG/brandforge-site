'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PLANS, getPlan, effectivePlan } = require('./plans');

test('plans only grow in capacity', () => {
  for (let i = 1; i < PLANS.length; i += 1) {
    assert.ok(PLANS[i].limits.workspaces > PLANS[i - 1].limits.workspaces);
    assert.ok(PLANS[i].limits.connectedAccounts > PLANS[i - 1].limits.connectedAccounts);
  }
  assert.equal(getPlan('nope').id, 'free');
});

test('a lapsed paid plan quietly returns to Free with no penalty', () => {
  const now = new Date('2026-10-08T00:00:00Z');
  assert.equal(effectivePlan('pro', '2026-11-01', now).id, 'pro');
  assert.equal(effectivePlan('pro', '2026-09-01', now).id, 'free');
  assert.equal(effectivePlan('pro', null, now).id, 'free');
});
