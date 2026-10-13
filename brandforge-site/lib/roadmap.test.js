'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DIRECTION, ROADMAP, STATUS_LABEL } = require('./roadmap.js');

test('every roadmap line has a known status, a title and a body', () => {
  for (const item of ROADMAP) {
    assert.ok(Object.prototype.hasOwnProperty.call(STATUS_LABEL, item.status), item.title);
    assert.ok(item.title.length > 0 && item.body.length > 0, item.title);
  }
});

test('each column of the roadmap has something in it', () => {
  for (const status of Object.keys(STATUS_LABEL)) assert.ok(ROADMAP.some((item) => item.status === status), status);
  assert.ok(DIRECTION.length >= 1);
});
