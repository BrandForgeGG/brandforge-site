'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { truncateText, formatMoney } = require('./format.js');

test('truncateText collapses whitespace and clips', () => {
  assert.equal(truncateText('  hello\n  world  ', 100), 'hello world');
  assert.equal(truncateText('abcdef', 4), 'abcd');
  assert.equal(truncateText(null), '');
  assert.equal(truncateText(undefined), '');
  assert.equal(truncateText(42), '42');
});

test('formatMoney renders priced amounts and blanks anything else', () => {
  assert.equal(formatMoney(18500, 'EUR'), 'EUR 18,500');
  assert.equal(formatMoney('900', 'EUR'), 'EUR 900');
  assert.equal(formatMoney(0, 'EUR'), '');
  assert.equal(formatMoney(-5, 'EUR'), '');
  assert.equal(formatMoney(NaN, 'EUR'), '');
  assert.equal(formatMoney('lots', 'EUR'), '');
  assert.equal(formatMoney(100, null), 'EUR 100');
  assert.equal(formatMoney(100, 'EUROPEAN-UNION-DOLLARS'), 'EUROPEAN 100');
});
