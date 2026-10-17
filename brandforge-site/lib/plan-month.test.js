'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { currentMonth, monthLines } = require('./plan-month.js');
const { getRetainer } = require('./plans.js');

test('the month is read from the chat lines', () => {
  assert.equal(currentMonth([]), 0);
  assert.equal(currentMonth(['hello', 'Paid: Growth €1,250/mo. Month 1 starts today.', 'Renewed: Growth €1,250/mo. Month 2 starts today.']), 2);
});

test('a new month says what was paid and how many tasks run at a time', () => {
  const [paid, how] = monthLines(getRetainer('growth'), 1, false);
  assert.equal(paid, 'Paid: Growth €1,250/mo. Month 1 starts today.');
  assert.match(how, /2 tasks at a time/);
  assert.match(monthLines(getRetainer('launch'), 3, true)[0], /^Renewed: .*Month 3 starts today\.$/);
  assert.match(monthLines(getRetainer('launch'), 1, false)[1], /1 task at a time/);
  assert.equal(currentMonth([monthLines(getRetainer('growth'), 4, true)[0]]), 4);
});
