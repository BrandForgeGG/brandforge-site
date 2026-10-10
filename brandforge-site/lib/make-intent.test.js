const test = require('node:test');
const assert = require('node:assert/strict');
const { detectMakeIntent } = require('./make-intent');

test('finds the format and the topic', () => {
  assert.deepEqual(detectMakeIntent('make a carousel about calm teams'), { kind: 'carousel', topic: 'calm teams' });
  assert.equal(detectMakeIntent('create a carousel for my newsletter readers').kind, 'carousel');
  // No subject yet: the chat asks what it is about.
  assert.deepEqual(detectMakeIntent('Make a carousel'), { kind: 'carousel', topic: '' });
  // Only what can be made today is offered.
  assert.equal(detectMakeIntent('Create a poll for my newsletter readers'), null);
});

test('needs both a verb and a format', () => {
  assert.equal(detectMakeIntent('what is a carousel'), null);
  assert.equal(detectMakeIntent('make me a landing page plan'), null);
  assert.equal(detectMakeIntent('hi'), null);
  assert.equal(detectMakeIntent(''), null);
});
