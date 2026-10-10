'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PLANS, getPlan, effectivePlan, RETAINERS, getRetainer } = require('./plans.js');

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

test('the monthly team plans are priced, ordered and findable', () => {
  assert.deepEqual(RETAINERS.map((plan) => plan.id), ['starter', 'growth', 'build', 'custom']);
  for (const plan of RETAINERS.filter((entry) => entry.id !== 'custom')) {
    assert.equal(plan.price.replace(/[^0-9]/g, ''), String(plan.cents / 100));
    assert.ok(plan.features.length >= 3);
  }
  assert.equal(RETAINERS.filter((plan) => plan.highlight).length, 1);
  assert.equal(getRetainer('growth').cents, 99000);
  assert.equal(getRetainer('free'), null);
});
