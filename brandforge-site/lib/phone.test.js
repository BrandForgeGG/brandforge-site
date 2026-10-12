'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, normalizeCode, maskPhone } = require('./phone.js');

test('international numbers are cleaned to E.164', () => {
  assert.equal(normalizePhone('+971 50 123 4567'), '+971501234567');
  assert.equal(normalizePhone('+1 (415) 555-0132'), '+14155550132');
  assert.equal(normalizePhone('00447911123456'), '+447911123456');
});

test('numbers without a country code, too short, too long or with letters are refused', () => {
  assert.equal(normalizePhone('0501234567'), null);
  assert.equal(normalizePhone('+12345'), null);
  assert.equal(normalizePhone('+1234567890123456'), null);
  assert.equal(normalizePhone('+44 79 abc 123456'), null);
  assert.equal(normalizePhone('+0123456789'), null);
  assert.equal(normalizePhone(null), null);
});

test('a texted code is six digits, however it was pasted', () => {
  assert.equal(normalizeCode('123456'), '123456');
  assert.equal(normalizeCode('123 456'), '123456');
  assert.equal(normalizeCode('12-34-56'), '123456');
  assert.equal(normalizeCode('12345'), null);
  assert.equal(normalizeCode('1234567'), null);
  assert.equal(normalizeCode('12a456'), null);
});

test('a masked number keeps the start and the last four digits', () => {
  assert.equal(maskPhone('+971501234567'), '+971 ••• 4567');
  assert.equal(maskPhone('123'), '123');
});
