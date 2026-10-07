'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { llmJson, llmJsonWithRepair } = require('./growth-llm.js');

test('llmJson parses valid JSON response', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '{"score": 85, "gaps": ["slow"]}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 },
    }),
  });

  const result = await llmJson({
    system: 'test',
    user: 'test',
    model: 'test-model',
    fetchImpl,
    config: { openrouterApiKey: 'key', openrouterBaseUrl: 'http://localhost', cheapModel: 'cheap', strongModel: 'strong' },
  });

  assert.equal(result.parsed.score, 85);
  assert.deepEqual(result.parsed.gaps, ['slow']);
  assert.equal(result.tokensIn, 100);
  assert.equal(result.tokensOut, 50);
});

test('llmJson extracts JSON from markdown-wrapped response', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '```json\n{"ok": true}\n```' } }],
      usage: {},
    }),
  });

  const result = await llmJson({
    system: 'test',
    user: 'test',
    model: 'test-model',
    fetchImpl,
    config: { openrouterApiKey: 'key', openrouterBaseUrl: 'http://localhost', cheapModel: 'cheap', strongModel: 'strong' },
  });

  assert.equal(result.parsed.ok, true);
});

test('llmJson returns null for unparseable response', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'not json at all' } }],
      usage: {},
    }),
  });

  const result = await llmJson({
    system: 'test',
    user: 'test',
    model: 'test-model',
    fetchImpl,
    config: { openrouterApiKey: 'key', openrouterBaseUrl: 'http://localhost', cheapModel: 'cheap', strongModel: 'strong' },
  });

  assert.equal(result.parsed, null);
});

test('llmJsonWithRepair retries on validation failure', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount++;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: callCount === 1 ? '{"score": -1}' : '{"score": 85}' } }],
        usage: {},
      }),
    };
  };

  const validate = (r) => {
    if (r.score < 0 || r.score > 100) return { ok: false, errors: ['score_out_of_range'] };
    return { ok: true, errors: [] };
  };

  const buildRepairPrompt = ({ errors }) => `Fix: ${errors.join(', ')}`;

  const result = await llmJsonWithRepair({
    system: 'test',
    user: 'test',
    validate,
    buildRepairPrompt,
    model: 'test-model',
    fetchImpl,
    config: { openrouterApiKey: 'key', openrouterBaseUrl: 'http://localhost', cheapModel: 'cheap', strongModel: 'strong' },
  });

  assert.equal(callCount, 2);
  assert.equal(result.repaired, true);
  assert.equal(result.parsed.score, 85);
});

test('llmJsonWithRepair returns errors when repair also fails', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '{"score": -1}' } }],
      usage: {},
    }),
  });

  const validate = (r) => {
    if (r.score < 0 || r.score > 100) return { ok: false, errors: ['score_out_of_range'] };
    return { ok: true, errors: [] };
  };

  const buildRepairPrompt = ({ errors }) => `Fix: ${errors.join(', ')}`;

  const result = await llmJsonWithRepair({
    system: 'test',
    user: 'test',
    validate,
    buildRepairPrompt,
    model: 'test-model',
    fetchImpl,
    config: { openrouterApiKey: 'key', openrouterBaseUrl: 'http://localhost', cheapModel: 'cheap', strongModel: 'strong' },
  });

  assert.equal(result.repaired, true);
  assert.equal(result.parsed.score, -1);
  assert.ok(result.validationErrors.includes('score_out_of_range'));
});
