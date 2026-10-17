'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seenLabel } = require('./seen.js');

test('last seen reads in plain words', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  assert.equal(seenLabel('2026-10-17T11:58:00Z', now), 'Online now');
  assert.equal(seenLabel('2026-10-17T11:48:00Z', now), 'Seen 12 min ago');
  assert.equal(seenLabel('2026-10-17T09:00:00Z', now), 'Seen 3 h ago');
  assert.equal(seenLabel('2026-10-16T12:00:00Z', now), 'Seen 1 day ago');
  assert.equal(seenLabel(null, now), '');
});
