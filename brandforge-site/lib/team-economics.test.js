'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { split, planSplits, goalMix, pathToGoal, euros } = require('./team-economics.js');

test('each plan splits 60% team, 40% BrandForge', () => {
  assert.deepEqual(split(125000), { team: 75000, brandforge: 50000 });
  assert.equal(planSplits().length, 3);
});

test('the goal mix is 8 clients and €10,800 a month', () => {
  const mix = goalMix();
  assert.equal(mix.clients, 8);
  assert.equal(mix.total, 1080000);
  assert.equal(euros(mix.brandforge), '€4,320');
});

test('the path to €10k counts clients and chats still needed', () => {
  const start = pathToGoal(0);
  assert.equal(start.average, 135000);
  assert.equal(start.clients, 8);
  assert.equal(start.chats, 32);
  assert.equal(pathToGoal(1250000).clients, 0);
  assert.equal(pathToGoal(500000).progress, 0.5);
});
