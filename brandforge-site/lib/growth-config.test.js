'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { growthConfig, envFlag, envInt, envNum } = require('./growth-config.js');

test('envFlag returns true only for "true" (case-insensitive)', () => {
  assert.equal(envFlag('X', { X: 'true' }), true);
  assert.equal(envFlag('X', { X: 'TRUE' }), true);
  assert.equal(envFlag('X', { X: 'True' }), true);
  assert.equal(envFlag('X', { X: 'false' }), false);
  assert.equal(envFlag('X', { X: '' }), false);
  assert.equal(envFlag('X', {}), false);
});

test('envInt returns fallback for missing or invalid values', () => {
  assert.equal(envInt('X', 42, {}), 42);
  assert.equal(envInt('X', 42, { X: 'not-a-number' }), 42);
  assert.equal(envInt('X', 42, { X: '7' }), 7);
  assert.equal(envInt('X', 42, { X: '' }), 42);
});

test('envNum returns fallback for missing or invalid values', () => {
  assert.equal(envNum('X', 3.14, {}), 3.14);
  assert.equal(envNum('X', 3.14, { X: 'abc' }), 3.14);
  assert.equal(envNum('X', 3.14, { X: '2.718' }), 2.718);
});

test('growthConfig returns defaults when no env vars set', () => {
  const config = growthConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.cheapModel, 'openai/gpt-4o-mini');
  assert.equal(config.strongModel, 'openai/gpt-4o-mini');
  assert.equal(config.maxCostUsdPerRun, 0.05);
  assert.equal(config.dailyCostCeilingUsd, 5.0);
  assert.equal(config.auditDailyLimit, 3);
  assert.equal(config.fetchTimeoutMs, 10000);
  assert.equal(config.fetchMaxBytes, 2097152);
  assert.equal(config.fetchMaxRedirects, 3);
});

test('growthConfig reads env overrides', () => {
  const env = {
    GROWTH_ENABLED: 'true',
    GROWTH_MODEL_CHEAP: 'anthropic/claude-3-haiku',
    GROWTH_MODEL_STRONG: 'openai/gpt-4o',
    GROWTH_MAX_COST_USD_PER_RUN: '0.10',
    GROWTH_DAILY_COST_CEILING_USD: '10.0',
    GROWTH_AUDIT_DAILY_LIMIT: '5',
    GROWTH_FETCH_TIMEOUT_MS: '15000',
  };
  const config = growthConfig(env);
  assert.equal(config.enabled, true);
  assert.equal(config.cheapModel, 'anthropic/claude-3-haiku');
  assert.equal(config.strongModel, 'openai/gpt-4o');
  assert.equal(config.maxCostUsdPerRun, 0.10);
  assert.equal(config.dailyCostCeilingUsd, 10.0);
  assert.equal(config.auditDailyLimit, 5);
  assert.equal(config.fetchTimeoutMs, 15000);
});
