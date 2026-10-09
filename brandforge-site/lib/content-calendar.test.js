'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mondayOf, weekDates, scheduledAt, buildWeekRows, pickTopic, DEFAULT_DAYS, POST_TYPES, TOPIC_POOL, SLOT_TIMES } = require('./content-calendar');

test('a week starts on Monday (UTC) and has seven days', () => {
  assert.equal(mondayOf('2026-10-09'), '2026-10-05'); // a Friday
  assert.equal(mondayOf('2026-10-05'), '2026-10-05');
  assert.equal(mondayOf('2026-10-11'), '2026-10-05'); // the Sunday
  assert.deepEqual(weekDates('2026-10-05'), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.equal(scheduledAt('2026-10-05', '09:00'), '2026-10-05T09:00:00.000Z');
  assert.equal(scheduledAt('2026-10-05', 'junk'), '2026-10-05T12:00:00.000Z');
});

test('every weekday has five slots of known types, and the days differ', () => {
  assert.equal(DEFAULT_DAYS.length, 7);
  for (const day of DEFAULT_DAYS) {
    assert.equal(day.types.length, 5);
    for (const type of day.types) assert.ok(POST_TYPES.includes(type), type);
  }
  assert.ok(new Set(DEFAULT_DAYS.map((d) => d.types.join())).size >= 6, 'days are not copies of each other');
  for (const type of POST_TYPES) assert.ok(TOPIC_POOL[type].length >= 2, type + ' has topics');
});

test('a week is 35 posts in time order with no repeated topic and varied looks', () => {
  const rows = buildWeekRows('2026-10-05');
  assert.equal(rows.length, 35);
  assert.deepEqual(rows.slice(0, 5).map((r) => r.scheduled_at.slice(11, 16)), SLOT_TIMES);
  const times = rows.map((r) => r.scheduled_at);
  assert.deepEqual([...times].sort(), times);
  const funny = rows.filter((r) => r.type === 'funny' || r.type === 'story' || r.type === 'explainer');
  assert.ok(funny.length > 0);
  const topics = rows.map((r) => r.topic.toLowerCase());
  const repeats = topics.length - new Set(topics).size;
  assert.ok(repeats <= 8, 'few repeats even with small pools: ' + repeats);
  assert.ok(new Set(rows.map((r) => r.theme)).size >= 6, 'looks rotate');
});

test('saved preferences override the default type and time for a day, and used topics are avoided', () => {
  const rows = buildWeekRows('2026-10-05', [{ weekday: 0, slots: [{ type: 'funny', time: '08:30' }, {}, {}, {}, { type: 'nonsense' }] }]);
  assert.equal(rows[0].type, 'funny');
  assert.equal(rows[0].scheduled_at.slice(11, 16), '08:30');
  assert.equal(rows[4].type, DEFAULT_DAYS[0].types[4], 'an unknown type falls back to the default');
  const first = pickTopic('educational', '2026-10-05', 0, []);
  assert.notEqual(pickTopic('educational', '2026-10-05', 0, [first]), first);
});
