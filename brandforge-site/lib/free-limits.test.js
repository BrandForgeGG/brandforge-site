'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FREE_LIMITS, monthKey, allowance, limitMessage } = require('./free-limits.js');

test('Free is 10 creations, 1 video and 2 channels', () => {
  assert.deepEqual({ ...FREE_LIMITS }, { creation: 10, video: 1, channel: 2 });
});

test('a use fits until the limit, then stops; paid never stops', () => {
  assert.equal(allowance('creation', 9, 'free').ok, true);
  assert.equal(allowance('creation', 10, 'free').ok, false);
  assert.equal(allowance('video', 0, 'free').left, 1);
  assert.equal(allowance('video', 1, 'free').ok, false);
  assert.equal(allowance('channel', 2, 'free').ok, false);
  assert.equal(allowance('creation', 500, 'pro').ok, true);
  assert.equal(allowance('video', 9, 'pro').ok, true);
  assert.equal(allowance('video', 10, 'pro').ok, false);
  assert.equal(allowance('video', 99, 'staff').ok, true);
});

test('months count in UTC and every kind has a plain message', () => {
  assert.equal(monthKey(new Date('2026-10-31T23:30:00Z')), '2026-10');
  for (const kind of ['creation', 'video', 'channel']) assert.ok(limitMessage(kind).length > 20);
});
