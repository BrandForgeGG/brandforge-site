'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PLANS, getPlan, getPaidPlan, effectivePlan, RETAINERS, getRetainer } = require('./plans.js');
const { DEFAULTS } = require('./ai-budget.js');

test('the software plans: Free and Pro, and Pro gives what the router gives', () => {
  assert.deepEqual(PLANS.map((plan) => plan.id), ['free', 'pro']);
  assert.equal(getPlan('nope').id, 'free');
  assert.equal(PLANS[0].aiDaily, DEFAULTS.userDaily);
  assert.equal(PLANS[1].aiDaily, DEFAULTS.userDaily * 10);
  assert.equal(PLANS[1].price.replace(/[^0-9]/g, ''), String(PLANS[1].cents / 100));
});

test('only priced plans can be paid by card', () => {
  assert.equal(getPaidPlan('pro').cents, 1900);
  assert.equal(getPaidPlan('growth').cents, 99000);
  assert.equal(getPaidPlan('free'), null);
  assert.equal(getPaidPlan('custom'), null);
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
