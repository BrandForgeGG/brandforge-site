'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSchedule, dueRows, outcomeOf, isStuck } = require('./schedule.js');

const NOW = Date.parse('2026-10-12T10:00:00Z');
const good = { runAt: '2026-10-13T07:00:00Z', channelIds: ['a'], caption: 'hi', slideCount: 3 };

test('a normal schedule is accepted and normalised to UTC', () => {
  const out = validateSchedule(good, NOW);
  assert.equal(out.ok, true);
  assert.equal(out.runAt, '2026-10-13T07:00:00.000Z');
});

test('a time already past is still accepted, to go out on the next run', () => {
  assert.equal(validateSchedule({ ...good, runAt: '2026-10-12T02:00:00Z' }, NOW).ok, true);
});

test('bad dates, no channel, no pictures, too far ahead and too long are refused', () => {
  assert.equal(validateSchedule({ ...good, runAt: 'nope' }, NOW).ok, false);
  assert.equal(validateSchedule({ ...good, channelIds: [] }, NOW).ok, false);
  assert.equal(validateSchedule({ ...good, slideCount: 0 }, NOW).ok, false);
  assert.equal(validateSchedule({ ...good, slideCount: 11 }, NOW).ok, false);
  assert.equal(validateSchedule({ ...good, runAt: '2027-03-01T00:00:00Z' }, NOW).ok, false);
  assert.equal(validateSchedule({ ...good, caption: 'x'.repeat(3001) }, NOW).ok, false);
  assert.equal(validateSchedule(null, NOW).ok, false);
});

test('only scheduled, due rows with tries left are picked', () => {
  const rows = [
    { id: 1, status: 'scheduled', run_at: '2026-10-12T09:00:00Z', attempts: 0 },
    { id: 2, status: 'scheduled', run_at: '2026-10-12T11:00:00Z', attempts: 0 },
    { id: 3, status: 'done', run_at: '2026-10-12T09:00:00Z', attempts: 1 },
    { id: 4, status: 'scheduled', run_at: '2026-10-12T09:00:00Z', attempts: 3 },
  ];
  assert.deepEqual(dueRows(rows, NOW).map((r) => r.id), [1]);
});

test('results become done, partial or failed', () => {
  assert.equal(outcomeOf({ a: { ok: true }, b: { ok: true } }), 'done');
  assert.equal(outcomeOf({ a: { ok: true }, b: { ok: false } }), 'partial');
  assert.equal(outcomeOf({ a: { ok: false } }), 'failed');
  assert.equal(outcomeOf({}), 'failed');
});

test('a run left posting for a quarter hour is stuck', () => {
  assert.equal(isStuck({ status: 'posting', run_at: 'x', claimed_at: '2026-10-12T09:30:00Z' }, NOW), true);
  assert.equal(isStuck({ status: 'posting', run_at: 'x', claimed_at: '2026-10-12T09:55:00Z' }, NOW), false);
  assert.equal(isStuck({ status: 'done', run_at: 'x', claimed_at: '2026-10-12T09:00:00Z' }, NOW), false);
});
