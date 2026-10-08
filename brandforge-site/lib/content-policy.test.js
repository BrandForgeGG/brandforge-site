'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { screenText } = require('./content-policy');

test('clear-cut sectors are declined with a neutral message', () => {
  for (const text of [
    'Make ads for my online casino',
    'Launch a payday loans brand',
    'Instagram plan for a vape shop',
    'Pyramid scheme recruiting post',
  ]) {
    const result = screenText(text);
    assert.equal(result.ok, false, text);
    assert.match(result.message, /doesn't create or promote/);
    assert.doesNotMatch(result.message, /islam|halal|haram|shariah/i);
  }
});

test('ordinary businesses pass, including near-miss words', () => {
  for (const text of [
    'Ad pack for a coffee roaster',
    'Launch plan for a booking app for salons',
    'A bank-free budgeting app',
    'Weeding services for gardens',
    'A ceramic wine-red mug',
  ]) {
    assert.equal(screenText(text).ok, true, text);
  }
  assert.equal(screenText(undefined).ok, true);
});
