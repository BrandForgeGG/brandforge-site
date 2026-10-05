const test = require('node:test');
const assert = require('node:assert/strict');
const { blueprintConfig, envFlag, envInt } = require('./blueprint-config.js');

test('the engine is dormant unless BLUEPRINT_ENABLED is explicitly true', () => {
  assert.equal(blueprintConfig({}).enabled, false);
  assert.equal(blueprintConfig({ BLUEPRINT_ENABLED: 'false' }).enabled, false);
  assert.equal(blueprintConfig({ BLUEPRINT_ENABLED: 'TRUE' }).enabled, true);
  assert.equal(blueprintConfig({ BLUEPRINT_ENABLED: ' true ' }).enabled, true);
});

test('research is a separate switch and stays off by default', () => {
  assert.equal(blueprintConfig({ BLUEPRINT_ENABLED: 'true' }).researchEnabled, false);
  assert.equal(blueprintConfig({ BLUEPRINT_RESEARCH: 'true' }).researchEnabled, true);
});

test('research defaults to keyed serper, inert without a key; ddg is opt-in free', () => {
  const config = blueprintConfig({});
  assert.equal(config.searchProvider, 'serper', 'keyed default: no key means no research calls');
  assert.equal(config.searchApiKey, '');
  assert.equal(config.searchCostUsd, 0.001);

  const free = blueprintConfig({ SEARCH_PROVIDER: 'ddg' });
  assert.equal(free.searchProvider, 'ddg');
  assert.equal(free.searchCostUsd, 0, 'the free provider bills nothing');

  assert.equal(blueprintConfig({ SEARCH_PROVIDER: 'serper' }).searchProvider, 'serper');
  assert.equal(blueprintConfig({ SEARCH_COST_USD: '0.004' }).searchCostUsd, 0.004, 'env always wins');
});

test('model tiers default to the chat model and override per tier', () => {
  const fallback = blueprintConfig({});
  assert.equal(fallback.extractModel, 'openai/gpt-4o-mini');
  assert.equal(fallback.synthModel, 'openai/gpt-4o-mini');

  const tuned = blueprintConfig({
    OPENROUTER_MODEL: 'anthropic/claude-3.5-haiku',
    BLUEPRINT_MODEL_EXTRACT: 'openai/gpt-4o-mini',
    BLUEPRINT_MODEL_SYNTH: 'anthropic/claude-3.7-sonnet',
  });
  assert.equal(tuned.extractModel, 'openai/gpt-4o-mini');
  assert.equal(tuned.synthModel, 'anthropic/claude-3.7-sonnet');
  assert.equal(blueprintConfig({ OPENROUTER_MODEL: 'x/y' }).synthModel, 'x/y');
});

test('quota knobs reject junk and fall back to the interim defaults', () => {
  const config = blueprintConfig({ BLUEPRINT_IP_HOURLY: '5', BLUEPRINT_DAILY_SESSION: 'oops' });
  assert.equal(config.maxSessionsPerIpPerHour, 5);
  assert.equal(config.runsPerSessionPerDay, 10);
  assert.equal(envInt('MISSING', 7, {}), 7);
  assert.equal(envInt('N', 7, { N: '-3' }), 7);
  assert.equal(envInt('N', 7, { N: '42' }), 42);
  assert.equal(envFlag('X', { X: 'yes' }), false);
});

test('the session secret falls back to the service-role key and reports missing', () => {
  assert.equal(blueprintConfig({ SUPABASE_SERVICE_ROLE_KEY: 'srk' }).sessionSecret, 'srk');
  assert.equal(blueprintConfig({ BLUEPRINT_SESSION_SECRET: 's1', SUPABASE_SERVICE_ROLE_KEY: 'srk' }).sessionSecret, 's1');
  assert.equal(blueprintConfig({}).sessionSecret, '');
});

test('intake bounds are fixed by the brief, not env', () => {
  const config = blueprintConfig({ BLUEPRINT_INTAKE_MAX: '99999' });
  assert.equal(config.intakeMinChars, 5);
  assert.equal(config.intakeMaxChars, 4000);
});
