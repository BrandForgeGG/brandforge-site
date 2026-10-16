'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkCustomTask } = require('./custom-task.js');

const details = 'A landing page for our new app, with a waitlist form and our brand colours.';

test('a task needs a name, a description and funds from €50', () => {
  assert.equal(checkCustomTask({ title: 'Landing page', details, funds: '450' }).ok, true);
  assert.deepEqual(checkCustomTask({ title: '  Landing   page ', details, funds: '€1,200' }).task, { title: 'Landing page', details, funds: 1200 });
  assert.equal(checkCustomTask({ title: 'Hi', details, funds: 450 }).ok, false);
  assert.equal(checkCustomTask({ title: 'Landing page', details: 'short', funds: 450 }).ok, false);
  assert.equal(checkCustomTask({ title: 'Landing page', details, funds: 20 }).ok, false);
  assert.equal(checkCustomTask({ title: 'Landing page', details, funds: 90000 }).ok, false);
});
