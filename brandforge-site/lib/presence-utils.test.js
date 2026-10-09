import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shapePresenceState,
  shapeTypingState,
  countStaffPresence,
  formatTypingLabel,
} from './presence-utils.js';

const self = { userId: 'me' };

test('duplicate tabs count once and self never leaks', () => {
  const state = {
    a: [
      { userId: 'ada', name: 'Ada', staff: true },
      { userId: 'ada', name: 'Ada', staff: true },
    ],
    b: [{ userId: 'me', name: 'Me', staff: false }],
  };
  assert.deepEqual(shapePresenceState(state, self), [{ name: 'Ada', staff: true }]);
});

test('blank names fall back by role', () => {
  const state = {
    a: [{ userId: 's1', name: '   ', staff: true }],
    b: [{ userId: 'u1', name: '', staff: false }],
    c: [{ userId: 'u2', staff: false }],
  };
  assert.deepEqual(shapePresenceState(state, self), [
    { name: 'BrandForge specialist', staff: true },
    { name: 'Teammate', staff: false },
    { name: 'Teammate', staff: false },
  ]);
});

test('names clip at forty characters and junk input returns empty', () => {
  const long = `x${'y'.repeat(100)}`;
  const state = { a: [{ userId: 'u1', name: long, staff: false }] };
  assert.equal(shapePresenceState(state, self)[0].name.length, 40);
  assert.deepEqual(shapePresenceState(null, self), []);
  assert.deepEqual(shapePresenceState('nope', self), []);
  assert.deepEqual(shapePresenceState({ a: 'nope' }, self), []);
});

test('typing shows others only, deduped, at most three', () => {
  const state = {
    a: [{ userId: 'me', name: 'Me', typing: true }],
    b: [
      { userId: 'ada', name: 'Ada', typing: true },
      { userId: 'ada', name: 'Ada', typing: true },
    ],
    c: [{ userId: 'bo', name: 'Bo', typing: true }],
    d: [{ userId: 'cy', name: 'Cy', typing: true }],
    e: [{ userId: 'di', name: 'Di', typing: true }],
    f: [{ userId: 'ed', name: 'Ed', typing: false }],
  };
  assert.deepEqual(shapeTypingState(state, 'me'), ['Ada', 'Bo', 'Cy']);
  assert.deepEqual(shapeTypingState(null, 'me'), []);
});

test('staff counting and typing labels', () => {
  const state = {
    a: [{ userId: 's1', staff: true }, { userId: 's1', staff: true }],
    b: [{ userId: 'u1', staff: false }],
  };
  assert.equal(countStaffPresence(state), 2);
  assert.equal(countStaffPresence(null), 0);
  assert.equal(formatTypingLabel([]), '');
  assert.equal(formatTypingLabel(['Ada']), 'Ada is typing…');
  assert.equal(formatTypingLabel(['Ada', 'Bo']), 'Ada and Bo are typing…');
  assert.equal(formatTypingLabel(['Ada', 'Bo', 'Cy']), 'Ada and 2 others are typing…');
});

test('typing never includes the person typing: the tracked state carries their user id', () => {
  const state = { a: [{ userId: 'me', name: 'Me', typing: true }], b: [{ userId: 'other', name: 'Sam', typing: true }] };
  assert.deepEqual(shapeTypingState(state, 'me'), ['Sam']);
  assert.deepEqual(shapePresenceState({ a: [{ userId: 'me', name: 'Me' }], b: [{ userId: 'other', name: 'Sam' }] }, { userId: 'me', name: 'Me', staff: false }).map((v) => v.name), ['Sam']);
});
