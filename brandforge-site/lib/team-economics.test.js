'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { split, planSplits, goalMix, pathToGoal, euros } = require('./team-economics.js');

test('each plan splits 60% team, 40% BrandForge', () => {
  assert.deepEqual(split(125000), { team: 75000, brandforge: 50000 });
  assert.equal(planSplits().length, 2);
});

test('the goal mix is 10 clients and €10,260 a month', () => {
  const mix = goalMix();
  assert.equal(mix.clients, 10);
  assert.equal(mix.total, 1026000);
  assert.equal(euros(mix.brandforge), '€4,104');
});

test('the path to €10k counts clients and chats still needed', () => {
  const start = pathToGoal(0);
  assert.equal(start.average, 102600);
  assert.equal(start.clients, 10);
  assert.equal(start.chats, 40);
  assert.equal(pathToGoal(1250000).clients, 0);
  assert.equal(pathToGoal(500000).progress, 0.5);
});
