const test = require('node:test');
const assert = require('node:assert/strict');

const { escapeHtml, oneLine } = require('./html.js');

test('escapeHtml neutralises markup in user-controlled strings', () => {
  assert.equal(
    escapeHtml('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;',
  );
  assert.equal(escapeHtml(`"quoted" and 'single'`), '&quot;quoted&quot; and &#39;single&#39;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml handles null, undefined and non-strings', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('oneLine strips newlines and control characters for subjects', () => {
  assert.equal(oneLine('Line one\r\nLine two'), 'Line one Line two');
  assert.equal(oneLine('  padded\ttext  '), 'padded text');
  assert.equal(oneLine(null), '');
});

test('oneLine caps length', () => {
  assert.equal(oneLine('x'.repeat(500), 120).length, 120);
});
