'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateImage, sniffImage, cleanPrompt, isBlockedPrompt, resetCooldowns } = require('./image-gen');

// A minimal "image": PNG magic bytes padded past the size floor.
function fakePng(size = 4000) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47]);
  return bytes;
}
function ok(bytes) {
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer, json: async () => ({}), text: async () => '' };
}
function fail(status, text = 'nope') {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}), text: async () => text };
}

test.beforeEach(() => resetCooldowns());

test('pollinations is used with no keys at all', async () => {
  const calls = [];
  const result = await generateImage({
    prompt: 'a candle on a table',
    env: {},
    fetchImpl: async (url) => {
      calls.push(String(url));
      return ok(fakePng());
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'pollinations');
  assert.equal(result.contentType, 'image/png');
  assert.match(calls[0], /image\.pollinations\.ai\/prompt\/a%20candle%20on%20a%20table/);
});

test('falls back from a failing configured provider to the next', async () => {
  const seen = [];
  const result = await generateImage({
    prompt: 'a candle on a table',
    env: { CF_ACCOUNT_ID: 'acc', CF_API_TOKEN: 'tok' },
    fetchImpl: async (url) => {
      seen.push(String(url));
      if (String(url).includes('api.cloudflare.com')) return fail(500, 'boom');
      return ok(fakePng());
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'pollinations');
  // Two Cloudflare models are tried before the next provider.
  assert.equal(seen.length, 3);
  assert.match(result.attempts[0], /cloudflare/);
});

test('cloudflare base64 result is decoded', async () => {
  const bytes = fakePng();
  const result = await generateImage({
    prompt: 'a candle on a table',
    env: { CF_ACCOUNT_ID: 'acc', CF_API_TOKEN: 'tok' },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: { image: Buffer.from(bytes).toString('base64') } }),
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => '',
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'cloudflare');
  assert.equal(result.bytes.length, bytes.length);
});

test('cloudflare tries FLUX.2 (multipart) first, then FLUX.1 (json), and reports why', async () => {
  const seen = [];
  const bytes = fakePng();
  const result = await generateImage({
    prompt: 'a candle on a table',
    env: { CF_ACCOUNT_ID: 'acc', CF_API_TOKEN: 'tok' },
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), multipart: init && init.body instanceof FormData });
      if (String(url).includes('flux-2')) return fail(400, 'bad input');
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { image: Buffer.from(bytes).toString('base64') } }),
        arrayBuffer: async () => new ArrayBuffer(0),
        text: async () => '',
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'cloudflare');
  assert.equal(seen.length, 2);
  assert.match(seen[0].url, /flux-2-klein-4b/);
  assert.equal(seen[0].multipart, true);
  assert.match(seen[1].url, /flux-1-schnell/);
  assert.equal(seen[1].multipart, false);
  assert.match(result.attempts.join(' '), /flux-2-klein-4b.*400/);
});

test('a bad cloudflare token stops after one call and cools down', async () => {
  let calls = 0;
  const result = await generateImage({
    prompt: 'a candle on a table',
    env: { CF_ACCOUNT_ID: 'acc', CF_API_TOKEN: 'bad' },
    fetchImpl: async (url) => {
      if (String(url).includes('api.cloudflare.com')) {
        calls += 1;
        return fail(401);
      }
      return ok(fakePng());
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.provider, 'pollinations');
});

test('a 200 that is not an image is rejected and the next provider is tried', async () => {
  let calls = 0;
  const html = new TextEncoder().encode('<html>error</html>'.padEnd(3000, ' '));
  const result = await generateImage({
    prompt: 'a candle on a table',
    env: { HF_TOKEN: 'hf' },
    fetchImpl: async (url) => {
      calls += 1;
      return String(url).includes('huggingface') ? ok(html) : ok(fakePng());
    },
  });
  assert.equal(result.provider, 'pollinations');
  assert.equal(calls, 2);
});

test('a provider that failed cools down instead of being retried on the next request', async () => {
  let cfCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('api.cloudflare.com')) {
      cfCalls += 1;
      return fail(401);
    }
    return ok(fakePng());
  };
  const env = { CF_ACCOUNT_ID: 'acc', CF_API_TOKEN: 'tok' };
  await generateImage({ prompt: 'first try', env, fetchImpl });
  await generateImage({ prompt: 'second try', env, fetchImpl });
  assert.equal(cfCalls, 1);
});

test('reports unavailable when every provider fails', async () => {
  const result = await generateImage({ prompt: 'a candle', env: {}, fetchImpl: async () => fail(503) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unavailable');
  assert.equal(result.attempts.length >= 1, true);
});

test('empty and blocked prompts never reach a provider', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return ok(fakePng());
  };
  assert.equal((await generateImage({ prompt: '  ', env: {}, fetchImpl })).reason, 'empty');
  assert.equal((await generateImage({ prompt: 'explicit nsfw picture', env: {}, fetchImpl })).reason, 'blocked');
  assert.equal(called, false);
});

test('helpers', () => {
  assert.equal(sniffImage(fakePng()), 'image/png');
  assert.equal(sniffImage(new Uint8Array(10)), null);
  assert.equal(cleanPrompt('  hello\n\tworld  ').length, 11);
  assert.equal(cleanPrompt('x'.repeat(2000)).length, 600);
  assert.equal(isBlockedPrompt('a friendly dog in a park'), false);
});
