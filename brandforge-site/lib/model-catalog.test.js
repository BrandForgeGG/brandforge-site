'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { describeModels, pickModel, MODEL_CATALOG } = require('./model-catalog');

test('a model is available only when OpenRouter really lists one of its ids', () => {
  const rows = describeModels(new Set(['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5']));
  assert.equal(rows.find((r) => r.name === 'GPT-4o mini').status, 'available');
  assert.equal(rows.find((r) => r.name === 'Claude Opus 5.5').status, 'not_yet');
  assert.equal(rows.find((r) => r.name === 'Claude Sonnet 4.5').routeId, 'anthropic/claude-sonnet-4.5');
  assert.ok(describeModels(null).every((r) => r.status === 'unknown'), 'unreadable live list is unknown, never "not yet"');
  assert.equal(rows.length, MODEL_CATALOG.length);
});

test('the answer model is the best routable one, env pins win, and the fallback is the cheap model', () => {
  const live = new Set(['openai/gpt-4.1', 'anthropic/claude-sonnet-4.5', 'openai/gpt-4o-mini']);
  assert.equal(pickModel('quality', live, {}), 'anthropic/claude-sonnet-4.5');
  assert.equal(pickModel('quality', new Set(['anthropic/claude-sonnet-5.5', 'anthropic/claude-sonnet-4.5']), {}), 'anthropic/claude-sonnet-5.5');
  assert.equal(pickModel('quality', live, { OPENROUTER_MODEL_QUALITY: 'google/gemini-2.5-pro' }), 'google/gemini-2.5-pro');
  assert.equal(pickModel('quality', new Set(), {}), 'openai/gpt-4o-mini');
  assert.equal(pickModel('quality', null, { OPENROUTER_MODEL: 'openai/gpt-4o' }), 'openai/gpt-4o');
  assert.equal(pickModel('fast', live, {}), 'openai/gpt-4o-mini');
});

test('without credit the standard model answers directly, premium models never get tried', () => {
  const live = new Set(['anthropic/claude-sonnet-5.5', 'openai/gpt-4o-mini']);
  assert.equal(pickModel('quality', live, {}, undefined, false), 'openai/gpt-4o-mini');
  assert.equal(pickModel('quality', live, { OPENROUTER_MODEL: 'openai/gpt-4o' }, undefined, false), 'openai/gpt-4o');
  assert.equal(pickModel('quality', live, {}, undefined, true), 'anthropic/claude-sonnet-5.5');
  assert.equal(pickModel('quality', live, { OPENROUTER_MODEL_QUALITY: 'google/gemini-2.5-pro' }, undefined, false), 'google/gemini-2.5-pro');
});
