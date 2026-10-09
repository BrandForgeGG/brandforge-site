'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { budgetLimits, decideBudget, utcDayStart } = require('./ai-budget');

test('limits come from env with safe defaults', () => {
  assert.deepEqual(budgetLimits({}), { userDaily: 150, alertAt: 400, hardCap: 1500 });
  assert.deepEqual(budgetLimits({ AI_USER_DAILY_LIMIT: '20', AI_DAILY_ALERT: 'x', AI_DAILY_HARD_CAP: '-3' }), { userDaily: 20, alertAt: 400, hardCap: 1500 });
});

test('a user is stopped at their cap, everyone at the global cap, staff never', () => {
  const limits = { userDaily: 10, alertAt: 50, hardCap: 100 };
  assert.equal(decideBudget({ userToday: 3, aiToday: 20 }, limits).allowed, true);
  assert.equal(decideBudget({ userToday: 10, aiToday: 20 }, limits).reason, 'user_daily');
  assert.equal(decideBudget({ userToday: 1, aiToday: 100 }, limits).reason, 'global_cap');
  assert.equal(decideBudget({ userToday: 99, aiToday: 999, isStaff: true }, limits).allowed, true);
});

test('the warning fires between the alert level and the ceiling, the cap alert above it', () => {
  const limits = { userDaily: 10, alertAt: 50, hardCap: 100 };
  assert.equal(decideBudget({ userToday: 0, aiToday: 49 }, limits).alert, null);
  assert.equal(decideBudget({ userToday: 0, aiToday: 50 }, limits).alert, 'warn');
  assert.equal(decideBudget({ userToday: 0, aiToday: 100 }, limits).alert, 'cap');
});

test('the day starts at UTC midnight', () => {
  assert.equal(utcDayStart('2026-10-09T17:45:00Z'), '2026-10-09T00:00:00.000Z');
});
