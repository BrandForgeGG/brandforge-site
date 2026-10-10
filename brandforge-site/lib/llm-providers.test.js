const test = require('node:test');
const assert = require('node:assert/strict');
const { configuredProviders, parseProviderModel, writerChain } = require('./llm-providers');

test('only providers with a key are used, in fallback order', () => {
  assert.deepEqual(configuredProviders({}).map((p) => p.id), []);
  assert.deepEqual(configuredProviders({ CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 't', GROQ_API_KEY: 'g' }).map((p) => p.id), ['groq', 'cf']);
  assert.equal(configuredProviders({ CF_API_TOKEN: 't' }).length, 0);
});

test('a provider model name resolves to a target, or says it is missing', () => {
  const env = { GROQ_API_KEY: 'g' };
  const ok = parseProviderModel('groq:', env);
  assert.equal(ok.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(ok.model, 'llama-3.3-70b-versatile');
  assert.equal(parseProviderModel('groq:other-model', env).model, 'other-model');
  assert.equal(parseProviderModel('gemini:', env).missing, true);
  assert.equal(parseProviderModel('openai/gpt-4o-mini', env), null);
});

test('the writer chain is paid model, configured providers, then the free model', () => {
  assert.deepEqual(writerChain({}), ['openai/gpt-4o-mini', 'nvidia/nemotron-3-super-120b-a12b:free']);
  assert.deepEqual(writerChain({ GEMINI_API_KEY: 'k', OPENROUTER_MODEL: 'm/x' }), ['m/x', 'gemini:', 'nvidia/nemotron-3-super-120b-a12b:free']);
});
