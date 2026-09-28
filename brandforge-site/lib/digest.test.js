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
