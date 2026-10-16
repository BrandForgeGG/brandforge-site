'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { answerTask } = require('./task-offer.js');

test('the team accepts or counters an open task', () => {
  const open = { status: 'open', amount: 450 };
  assert.deepEqual(answerTask(open, 'accept', null, 'team').state, { status: 'accepted', amount: 450 });
  const counter = answerTask(open, 'counter', { amount: '600', note: 'Includes the mobile version' }, 'team');
  assert.deepEqual(counter.state, { status: 'countered', amount: 450, counterAmount: 600, counterNote: 'Includes the mobile version' });
  assert.equal(answerTask(open, 'counter', { amount: 450 }, 'team').ok, false);
  assert.equal(answerTask(open, 'counter', { amount: 10 }, 'team').ok, false);
  assert.equal(answerTask(open, 'accept_counter', null, 'buyer').status, 409);
});

test('the buyer answers a counter; nobody answers a funded task', () => {
  const countered = { status: 'countered', amount: 450, counterAmount: 600 };
  assert.deepEqual(answerTask(countered, 'accept_counter', null, 'buyer').state, { status: 'accepted', amount: 600 });
  assert.deepEqual(answerTask(countered, 'decline_counter', null, 'buyer').state, { status: 'open', amount: 450 });
  assert.equal(answerTask(countered, 'accept', null, 'team').status, 409);
  assert.equal(answerTask({ status: 'funded', amount: 450 }, 'accept', null, 'team').status, 409);
  assert.equal(answerTask({ status: 'open', amount: 450 }, 'accept', null, 'other').status, 403);
});
