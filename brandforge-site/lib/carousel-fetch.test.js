'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchImageSafe, sniff } = require('./carousel-fetch');
const { extractOgImage } = require('./research');

const PNG = new Uint8Array(400);
PNG.set([0x89, 0x50, 0x4e, 0x47]);
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

function reply(bytes, init = {}) {
  return new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' }, ...init });
}

test('a real image comes back with its sniffed type', async () => {
  const out = await fetchImageSafe('https://example.org/a.png', { fetchImpl: async () => reply(PNG), lookupImpl: publicLookup });
  assert.equal(out.contentType, 'image/png');
  assert.equal(out.bytes.length, 400);
});

test('private addresses are refused before any request is made', async () => {
  let called = false;
  await assert.rejects(
    fetchImageSafe('http://169.254.169.254/latest/meta-data', { fetchImpl: async () => { called = true; return reply(PNG); } }),
    /research_/
  );
  assert.equal(called, false);
});

test('html pretending to be an image, and oversized bodies, are rejected', async () => {
  const html = new TextEncoder().encode('<html>' + 'x'.repeat(500));
  await assert.rejects(fetchImageSafe('https://example.org/a.png', { fetchImpl: async () => reply(html), lookupImpl: publicLookup }), /image_not_an_image/);
  await assert.rejects(fetchImageSafe('https://example.org/a.png', { fetchImpl: async () => reply(new Uint8Array(5000)), lookupImpl: publicLookup, maxBytes: 1000 }), /image_too_large/);
});

test('redirects are followed only to public hosts', async () => {
  let n = 0;
  const fetchImpl = async () => (n++ === 0 ? new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret.png' } }) : reply(PNG));
  await assert.rejects(fetchImageSafe('https://example.org/a.png', { fetchImpl, lookupImpl: publicLookup }), /research_/);
});

test('the preview image is read from Open Graph or Twitter tags and made absolute', () => {
  assert.equal(extractOgImage('<meta property="og:image" content="/img/card.png">', 'https://acme.test/page'), 'https://acme.test/img/card.png');
  assert.equal(extractOgImage('<meta name="twitter:image" content="https://cdn.test/x.jpg">', 'https://acme.test/'), 'https://cdn.test/x.jpg');
  assert.equal(extractOgImage('<meta property="og:image" content="javascript:alert(1)">', 'https://acme.test/'), null);
  assert.equal(extractOgImage('<p>none</p>', 'https://acme.test/'), null);
  assert.equal(sniff(new Uint8Array(10)), null);
});
