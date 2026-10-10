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

test('the image makers: ads, announcements, and quote, tip or poll images', () => {
  assert.deepEqual(detectMakeIntent('make an ad for my bakery'), { kind: 'ad', topic: 'my bakery' });
  assert.equal(detectMakeIntent('Create an announcement about our launch').kind, 'announcement');
  assert.equal(detectMakeIntent('design a quote card about consistency').kind, 'quote');
  assert.equal(detectMakeIntent('make a poll image about coffee or tea').kind, 'question');
  assert.equal(detectMakeIntent('make a tip graphic on writing hooks').kind, 'tip');
  // A carousel word wins when both appear.
  assert.equal(detectMakeIntent('make a carousel ad about shoes').kind, 'carousel');
  // Everyday uses of the same words never open a maker.
  assert.equal(detectMakeIntent('write a quote for the website project'), null);
  assert.equal(detectMakeIntent('create a poll for my newsletter readers'), null);
  assert.equal(detectMakeIntent('write a tip to my team about the deadline'), null);
  assert.equal(detectMakeIntent('please add the new page'), null);
});
