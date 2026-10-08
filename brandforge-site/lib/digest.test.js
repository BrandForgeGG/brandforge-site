'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildWeeklyDigest } = require('./digest.js');

test('a busy week reads as one plain sentence', () => {
  assert.equal(
    buildWeeklyDigest({ posted: 6, matched: 2, funded: 1, shipped: 3 }),
    'This week in BrandForge: 6 new projects posted, 2 matched, 1 funded, 3 shipped.'
  );
});

test('singular counts read correctly', () => {
  assert.equal(
    buildWeeklyDigest({ posted: 1, matched: 1, funded: 0, shipped: 0 }),
    'This week in BrandForge: 1 new project posted, 1 matched, 0 funded, 0 shipped.'
  );
});

test('an empty week says so honestly', () => {
  const text = buildWeeklyDigest({});
  assert.ok(text.includes('quiet on the platform'));
  assert.ok(!/\d/.test(text), 'no invented numbers in a quiet week');
});

test('missing input defaults to zero, never throws', () => {
  assert.ok(buildWeeklyDigest().includes('quiet on the platform'));
  assert.ok(buildWeeklyDigest({ posted: 2 }).includes('2 new projects posted'));
});

test('the live stats line lists only what really happened and is silent on a quiet day', () => {
  const { buildLiveStats } = require('./digest');
  assert.equal(buildLiveStats({}), null);
  assert.equal(buildLiveStats({ chats: 0, members: 0 }), null);
  assert.equal(
    buildLiveStats({ chats: 12, guestChats: 3, members: 2, listings: 1, contractsSigned: 1, milestonesReleased: 2 }),
    'BrandForge, last 24 hours: 12 chats started (3 without an account), 2 new members, 1 listing in Trade, 1 contract signed, 2 milestones released.',
  );
  assert.equal(buildLiveStats({ chats: 1 }, 'this week'), 'BrandForge, this week: 1 chat started.');
});
