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

test('after funding: the team sends it for review; the buyer approves or asks for changes', () => {
  const funded = { status: 'funded', amount: 450 };
  assert.equal(answerTask(funded, 'submit', { note: '' }, 'team').ok, false);
  const review = answerTask(funded, 'submit', { link: 'example.com/landing', note: 'First version' }, 'team');
  assert.deepEqual(review.state, { status: 'review', amount: 450, reviewNote: 'First version', reviewLink: 'https://example.com/landing' });
  assert.deepEqual(answerTask(review.state, 'approve', null, 'buyer').state, { status: 'delivered', amount: 450 });
  assert.deepEqual(answerTask(review.state, 'changes', { note: 'Bigger logo' }, 'buyer').state, { status: 'funded', amount: 450, changesNote: 'Bigger logo' });
  assert.equal(answerTask(review.state, 'changes', { note: '' }, 'buyer').ok, false);
  assert.equal(answerTask(funded, 'approve', null, 'buyer').status, 409);
  assert.equal(answerTask({ status: 'delivered', amount: 450 }, 'approve', null, 'buyer').status, 409);
});
