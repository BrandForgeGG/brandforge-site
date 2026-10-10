const test = require('node:test');
const assert = require('node:assert/strict');
const { detectMakeIntent } = require('./make-intent');

test('finds the format and the topic', () => {
  assert.deepEqual(detectMakeIntent('make a carousel about calm teams'), { kind: 'carousel', topic: 'calm teams' });
  assert.equal(detectMakeIntent('Create a poll for my newsletter readers').kind, 'poll');
  assert.equal(detectMakeIntent('write a thread on pricing mistakes').kind, 'thread');
  assert.equal(detectMakeIntent('draft a quiz about coffee').kind, 'quiz');
});

test('needs both a verb and a format', () => {
  assert.equal(detectMakeIntent('what is a carousel'), null);
  assert.equal(detectMakeIntent('make me a landing page plan'), null);
  assert.equal(detectMakeIntent('hi'), null);
  assert.equal(detectMakeIntent(''), null);
});
