'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateXray, analyzeCompetitors } = require('./growth-xray.js');
const { getSearchProvider, createStubProvider } = require('./growth-search.js');

test('validateXray accepts valid input', () => {
  const result = validateXray({
    positioning_map: [],
    offers: [],
    hooks: [],
    formats: [],
    gaps: [],
    angles: [],
  });
  assert.equal(result.ok, true);
});

test('validateXray rejects non-object', () => {
  assert.equal(validateXray(null).ok, false);
  assert.equal(validateXray('string').ok, false);
});

test('validateXray rejects missing arrays', () => {
  const result = validateXray({ positioning_map: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('offers_not_array'));
});

test('analyzeCompetitors returns parse_failed for bad LLM response', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'not json' } }],
      usage: {},
    }),
  });

  const result = await analyzeCompetitors(
    [{ url: 'http://example.com', content: 'test' }],
    null,
    { fetchImpl, config: { cheapModel: 'test', strongModel: 'test', openrouterApiKey: 'key', openrouterBaseUrl: 'http://localhost' } }
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'parse_failed');
});

test('analyzeCompetitors extracts from mocked response', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('chat/completions')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"positioning_map":[],"offers":[],"hooks":[],"formats":[],"gaps":[],"angles":[]}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: Buffer.from('test content') };
            },
            cancel: async () => {},
          };
        },
      },
    };
  };

  const result = await analyzeCompetitors(
    [{ url: 'http://example.com', content: 'test content' }],
    { name: 'Acme', offer: 'widgets' },
    { fetchImpl, config: { cheapModel: 'test', strongModel: 'test', openrouterApiKey: 'key', openrouterBaseUrl: 'http://localhost' } }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.xray.positioning_map, []);
  assert.deepEqual(result.xray.angles, []);
});

test('getSearchProvider returns stub by default', () => {
  const provider = getSearchProvider({});
  assert.equal(provider.name, 'stub');
});

test('getSearchProvider returns serper when configured', () => {
  const provider = getSearchProvider({ searchProvider: 'serper', serperApiKey: 'key' });
  assert.equal(provider.name, 'serper');
});

test('stub provider returns empty results', async () => {
  const provider = createStubProvider();
  const result = await provider.search('test query');
  assert.equal(result.ok, true);
  assert.deepEqual(result.results, []);
  assert.equal(result.source, 'stub');
});
