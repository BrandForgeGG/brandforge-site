'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isPublicIp, assertSafeUrl, fetchUrl } = require('./growth-fetch.js');

test('isPublicIp allows standard public IPv4', () => {
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('1.1.1.1'), true);
  assert.equal(isPublicIp('203.0.113.1'), true);
});

test('isPublicIp blocks private and reserved ranges', () => {
  assert.equal(isPublicIp('10.0.0.1'), false);
  assert.equal(isPublicIp('127.0.0.1'), false);
  assert.equal(isPublicIp('169.254.1.1'), false);
  assert.equal(isPublicIp('172.16.0.1'), false);
  assert.equal(isPublicIp('172.31.255.255'), false);
  assert.equal(isPublicIp('192.168.1.1'), false);
  assert.equal(isPublicIp('100.64.0.1'), false);
  assert.equal(isPublicIp('0.0.0.0'), false);
  assert.equal(isPublicIp('224.0.0.1'), false);
  assert.equal(isPublicIp('255.255.255.255'), false);
});

test('isPublicIp allows global unicast IPv6', () => {
  assert.equal(isPublicIp('2001:4860:4860::8888'), true);
  assert.equal(isPublicIp('2606:4700:4700::1111'), true);
});

test('isPublicIp blocks IPv6 loopback and link-local', () => {
  assert.equal(isPublicIp('::1'), false);
  assert.equal(isPublicIp('fe80::1'), false);
  assert.equal(isPublicIp('fd00::1'), false);
});

test('assertSafeUrl rejects non-http(s) protocols', async () => {
  await assert.rejects(() => assertSafeUrl('ftp://example.com'), /invalid_protocol/);
  await assert.rejects(() => assertSafeUrl('file:///etc/passwd'), /invalid_protocol/);
});

test('assertSafeUrl rejects URLs with credentials', async () => {
  await assert.rejects(() => assertSafeUrl('http://user:pass@example.com'), /credentials/);
});

test('assertSafeUrl rejects localhost and internal hostnames', async () => {
  await assert.rejects(() => assertSafeUrl('http://localhost:3000'), /blocked_host/);
  await assert.rejects(() => assertSafeUrl('http://metadata.google.internal'), /blocked_host/);
  await assert.rejects(() => assertSafeUrl('http://something.local'), /blocked_host/);
});

test('assertSafeUrl rejects private IPs', async () => {
  await assert.rejects(() => assertSafeUrl('http://192.168.1.1'), /private_ip/);
  await assert.rejects(() => assertSafeUrl('http://10.0.0.1'), /private_ip/);
  await assert.rejects(() => assertSafeUrl('http://127.0.0.1'), /private_ip/);
});

test('assertSafeUrl rejects invalid URLs', async () => {
  await assert.rejects(() => assertSafeUrl('not-a-url'), /invalid_url/);
  await assert.rejects(() => assertSafeUrl(''), /invalid_url/);
});

test('fetchUrl enforces byte cap', async () => {
  const longText = 'x'.repeat(10000);
  const fetchImpl = async () => ({
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
            return { done: false, value: Buffer.from(longText) };
          },
          cancel: async () => {},
        };
      },
    },
    text: async () => longText,
  });

  await assert.rejects(
    () => fetchUrl('http://example.com', { fetchImpl, maxBytes: 100, lookupImpl: async () => ['93.184.216.34'] }),
    /too_large/
  );
});

test('fetchUrl rejects disallowed content types', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/octet-stream']]),
    body: null,
    text: async () => '',
  });

  await assert.rejects(
    () => fetchUrl('http://example.com', { fetchImpl, lookupImpl: async () => ['93.184.216.34'] }),
    /content_type/
  );
});
