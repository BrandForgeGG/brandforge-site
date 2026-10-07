'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateBrandKit, normalizeBrandKitInput, extractBrandKitFromUrl } = require('./growth-brand-kit.js');

test('validateBrandKit accepts valid input', () => {
  const result = validateBrandKit({
    name: 'Acme',
    logo_url: 'https://example.com/logo.png',
    palette: ['#ff0000'],
    fonts: ['Inter'],
    tone_of_voice: 'friendly',
    audience: 'developers',
    offer: 'widgets',
    key_claims: ['best'],
    social_links: ['https://twitter.com/acme'],
  });
  assert.equal(result.ok, true);
});

test('validateBrandKit rejects non-object', () => {
  assert.equal(validateBrandKit(null).ok, false);
  assert.equal(validateBrandKit('string').ok, false);
  assert.equal(validateBrandKit(42).ok, false);
});

test('validateBrandKit rejects wrong types', () => {
  const result = validateBrandKit({
    name: 123,
    logo_url: [],
    palette: 'not-array',
    fonts: 'not-array',
    tone_of_voice: 42,
    audience: 42,
    offer: 42,
    key_claims: 'not-array',
    social_links: 'not-array',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('name_not_string'));
  assert.ok(result.errors.includes('palette_not_array'));
});

test('validateBrandKit allows null for optional fields', () => {
  const result = validateBrandKit({
    name: null,
    logo_url: null,
    palette: [],
    fonts: [],
    tone_of_voice: null,
    audience: null,
    offer: null,
    key_claims: [],
    social_links: [],
  });
  assert.equal(result.ok, true);
});

test('normalizeBrandKitInput cleans and defaults', () => {
  const result = normalizeBrandKitInput({
    name: '  Acme  ',
    palette: ['#fff', 123],
    fonts: ['Inter'],
  });
  assert.equal(result.name, 'Acme');
  assert.deepEqual(result.palette, ['#fff', '123']);
  assert.deepEqual(result.fonts, ['Inter']);
  assert.equal(result.logo_url, null);
  assert.deepEqual(result.key_claims, []);
});

test('extractBrandKitFromUrl returns fetch_failed for bad URLs', async () => {
  const result = await extractBrandKitFromUrl('http://192.168.1.1', {
    lookupImpl: async () => ['192.168.1.1'],
    config: { brandKitEnabled: true, cheapModel: 'test', openrouterApiKey: 'key', openrouterBaseUrl: 'http://localhost' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'fetch_failed');
});

test('extractBrandKitFromUrl extracts from mocked page', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('chat/completions')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"name":"Acme","logo_url":null,"palette":["#ff0000"],"fonts":["Inter"],"tone_of_voice":"friendly","audience":"devs","offer":"widgets","key_claims":["best"],"social_links":[]}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/html']]),
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: Buffer.from('<html><body>Acme Corp</body></html>') };
            },
            cancel: async () => {},
          };
        },
      },
    };
  };

  const result = await extractBrandKitFromUrl('http://example.com', {
    fetchImpl,
    lookupImpl: async () => ['93.184.216.34'],
    config: {
      brandKitEnabled: true,
      cheapModel: 'test',
      openrouterApiKey: 'key',
      openrouterBaseUrl: 'http://localhost',
      fetchTimeoutMs: 5000,
      fetchMaxBytes: 10000,
      fetchMaxRedirects: 3,
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.brandKit.name, 'Acme');
  assert.equal(result.brandKit.domain, 'example.com');
});
