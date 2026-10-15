'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findSlop, isSloppy, withCraft, CRAFT_RULES } = require('./craft.js');

test('finds the usual AI-isms', () => {
  assert.deepEqual(findSlop('Unlock the power of AI and elevate your brand in today\'s fast-paced world').length, 3);
  assert.equal(isSloppy('A seamless way to leverage your content'), true);
});

test('leaves plain, specific writing alone', () => {
  assert.deepEqual(findSlop('Paste your site. Get a 40 second launch video in your colours.'), []);
  assert.equal(isSloppy('One elevated word is not enough to call it slop'), false);
});

test('adds the house rules to a prompt', () => {
  const system = withCraft('You write ads.');
  assert.ok(system.startsWith('You write ads.'));
  assert.ok(system.includes(CRAFT_RULES));
});
