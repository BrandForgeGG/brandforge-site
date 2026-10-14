'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BUDGET, uploadPlan } = require('./upload-fit.js');

const MB = 1024 * 1024;

test('pictures that fit go as they are', () => {
  assert.deepEqual(uploadPlan([1 * MB, 1 * MB]), { reencode: false });
  assert.deepEqual(uploadPlan([]), { reencode: false });
});

test('a carousel over the limit is re-encoded as JPEG', () => {
  const plan = uploadPlan(Array(8).fill(0.8 * MB));
  assert.equal(plan.reencode, true);
  assert.equal(plan.scale, 1);
});

test('a very large set is also scaled down a little', () => {
  const plan = uploadPlan(Array(10).fill(3 * MB));
  assert.equal(plan.reencode, true);
  assert.ok(plan.scale < 1 && plan.quality < 0.88);
});

test('the budget stays under the 4.5 MB request limit', () => {
  assert.ok(BUDGET < 4.5 * MB);
});
