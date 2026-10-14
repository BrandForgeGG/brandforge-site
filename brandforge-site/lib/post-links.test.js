'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { postUrl } = require('./post-links.js');

test('a failed send has no link', () => {
  assert.equal(postUrl('bluesky', { meta: { handle: 'a.bsky.social' } }, { ok: false, ref: 'x' }), null);
});

test('networks that answer with an address pass it through', () => {
  assert.equal(postUrl('mastodon', {}, { ok: true, url: 'https://mastodon.social/@me/1' }), 'https://mastodon.social/@me/1');
  assert.equal(postUrl('threads', {}, { ok: true, url: 'javascript:alert(1)' }), null);
});

test('ids become the public post page', () => {
  assert.equal(postUrl('bluesky', { meta: { handle: 'me.bsky.social' } }, { ok: true, ref: 'at://did:plc:abc/app.bsky.feed.post/3kxyz' }), 'https://bsky.app/profile/me.bsky.social/post/3kxyz');
  assert.equal(postUrl('telegram', { label: '@brandforge' }, { ok: true, ref: '42' }), 'https://t.me/brandforge/42');
  assert.equal(postUrl('tumblr', { meta: { blog: 'brandforge' } }, { ok: true, ref: '7712' }), 'https://brandforge.tumblr.com/post/7712');
  assert.equal(postUrl('linkedin', {}, { ok: true, ref: 'urn:li:share:7300' }), 'https://www.linkedin.com/feed/update/urn:li:share:7300');
  assert.equal(postUrl('facebook', {}, { ok: true, ref: '123_456' }), 'https://www.facebook.com/123_456');
});

test('private places and odd ids give no link', () => {
  assert.equal(postUrl('telegram', { label: 'Private group' }, { ok: true, ref: '42' }), null);
  assert.equal(postUrl('discord', {}, { ok: true, ref: '1' }), null);
  assert.equal(postUrl('linkedin', {}, { ok: true, ref: 'nonsense' }), null);
});
