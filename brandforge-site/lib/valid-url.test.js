'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isValidUrl } = require('./valid-url.js');

test('accepts https and http URLs', () => {
  assert.equal(isValidUrl('https://brandforge.gg'), true);
  assert.equal(isValidUrl('http://example.com/path?q=1#frag'), true);
  assert.equal(isValidUrl('  https://producthunt.com/posts/x  '), true);
});

test('rejects non-URL schemes', () => {
  assert.equal(isValidUrl('javascript:alert(1)'), false);
  assert.equal(isValidUrl('data:text/html,<script>'), false);
  assert.equal(isValidUrl('mailto:hello@brandforge.gg'), false);
  assert.equal(isValidUrl('ftp://files.example.com'), false);
});

test('rejects garbage and empty values', () => {
  assert.equal(isValidUrl('not a url'), false);
  assert.equal(isValidUrl('brandforge.gg'), false);
  assert.equal(isValidUrl(''), false);
  assert.equal(isValidUrl('   '), false);
});

test('rejects non-strings', () => {
  assert.equal(isValidUrl(null), false);
  assert.equal(isValidUrl(undefined), false);
  assert.equal(isValidUrl(42), false);
  assert.equal(isValidUrl({ href: 'https://brandforge.gg' }), false);
});
