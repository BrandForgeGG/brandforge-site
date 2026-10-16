'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { currentMonth, monthTasks } = require('./plan-month.js');

test('the month is read from the work list titles', () => {
  assert.equal(currentMonth([]), 0);
  assert.equal(currentMonth(['Logo', 'Month 1: 12 posts or carousels', 'Month 2: 4 short videos']), 2);
});

test('each paid month gets the plan deliverables, due in 30 days', () => {
  const tasks = monthTasks('growth', 2, new Date('2026-10-16T00:00:00Z'));
  assert.equal(tasks.length, 5);
  assert.equal(tasks[0].title, 'Month 2: 12 posts or carousels');
  assert.equal(tasks[0].due_date, '2026-11-15');
  assert.deepEqual(monthTasks('pro', 1), []);
  assert.deepEqual(monthTasks('growth', 0), []);
});
