'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chainFor, writerModels, noteFailure, noteSuccess, limitsFor, imageQuality, resetCooling, PRO_WRITERS_DEFAULT } = require('./model-router.js');
const { decideBudget } = require('./ai-budget.js');

const ENV = { GROQ_API_KEY: 'k' };

test('free accounts use the everyday chain; paying ones get the strongest writers first, then the same fallbacks', () => {
  const free = chainFor('free', ENV);
  const pro = chainFor('pro', ENV);
  assert.equal(free[0], 'openai/gpt-4o-mini');
  assert.deepEqual(pro.slice(0, PRO_WRITERS_DEFAULT.length), PRO_WRITERS_DEFAULT);
  for (const model of free) assert.ok(pro.includes(model), `${model} stays as a fallback`);
});

test('the paid writers can be changed without a deploy', () => {
  assert.deepEqual(chainFor('pro', { PRO_WRITER_MODELS: 'x/best, y/next' }).slice(0, 2), ['x/best', 'y/next']);
});

test('a model that just failed goes to the back of the line, and comes back after the cool-down or a success', () => {
  resetCooling();
  const now = 1_000_000;
  const first = writerModels('free', ENV, now)[0];
  noteFailure(first, now);
  const after = writerModels('free', ENV, now + 1000);
  assert.notEqual(after[0], first);
  assert.equal(after[after.length - 1], first);
  assert.equal(writerModels('free', ENV, now + 6 * 60 * 1000)[0], first);
  noteFailure(first, now);
  noteSuccess(first);
  assert.equal(writerModels('free', ENV, now + 1000)[0], first);
  resetCooling();
});

test('paying accounts get ten times the allowance and are never stopped by the shared cap', () => {
  const limits = { userDaily: 10, alertAt: 50, hardCap: 100 };
  assert.equal(limitsFor('pro', limits).userDaily, 100);
  assert.equal(limitsFor('free', limits).userDaily, 10);
  assert.equal(decideBudget({ userToday: 1, aiToday: 500 }, limits).reason, 'global_cap');
  assert.equal(decideBudget({ userToday: 1, aiToday: 500, paid: true }, limitsFor('pro', limits)).allowed, true);
  assert.equal(decideBudget({ userToday: 100, aiToday: 5, paid: true }, limitsFor('pro', limits)).reason, 'user_daily');
});

test('paying accounts always get the best pictures', () => {
  assert.equal(imageQuality('pro', 'fast'), 'best');
  assert.equal(imageQuality('free', 'fast'), 'fast');
});
