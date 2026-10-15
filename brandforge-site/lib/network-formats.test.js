'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fitCaption, splitTags, cutText, versionsFor, networkOf } = require('./network-formats.js');

const LONG = [
  'Most launch videos lose people in the first second. The fix is simple: put the promise on the first frame, not a logo.',
  'We tested it on 40 posts and the hook mattered more than the edit. Short lines, one idea per scene, and a clear next step.',
  'Here is the full breakdown of what we changed, scene by scene, with the before and after for each one so you can copy it.',
  'Comment GUIDE and we will send it to you.',
  '#marketing #launch #video #startup #growth #creator #ai #design #reels',
].join('\n');

test('hashtags are pulled out and kept once', () => {
  const { body, tags } = splitTags('Hello #a world #b #a');
  assert.equal(body, 'Hello world');
  assert.deepEqual(tags, ['#a', '#b']);
});

test('text is cut at a sentence, else at a word, never mid-word', () => {
  assert.equal(cutText('One two. Three four five six.', 20), 'One two.');
  assert.equal(cutText('alpha beta gamma delta epsilon zeta', 20), 'alpha beta gamma…');
  assert.equal(cutText('short', 20), 'short');
});

test('each network gets its limit and its hashtag budget, and keeps the call to action', () => {
  const x = fitCaption('x', LONG);
  assert.ok([...x].length <= 280, `x is ${[...x].length}`);
  assert.match(x, /Comment GUIDE and we will send it to you\./);
  assert.equal((x.match(/#/g) || []).length, 2);
  assert.ok(!/\w…\w/.test(x));

  const bluesky = fitCaption('bluesky', LONG);
  assert.ok([...bluesky].length <= 300);
  assert.match(bluesky, /Comment GUIDE/);

  const insta = fitCaption('instagram', LONG);
  assert.equal((insta.match(/#/g) || []).length, 8);
  assert.match(insta, /scene by scene/);

  const discord = fitCaption('discord', LONG);
  assert.equal((discord.match(/#/g) || []).length, 0);

  const linkedin = fitCaption('linkedin', LONG);
  assert.equal((linkedin.match(/#/g) || []).length, 3);
});

test('a caption that already fits is left alone apart from hashtags', () => {
  assert.equal(fitCaption('instagram', 'Hello there.\n\nFollow for more. #a #b'), 'Hello there.\n\nFollow for more.\n\n#a #b');
});

test('unknown networks fall back to a safe portrait format', () => {
  assert.equal(networkOf('newnetwork').shape, 'portrait');
});

test('channels with the same shape and caption go out together', () => {
  const kinds = { a: 'instagram', b: 'facebook', c: 'x', d: 'mastodon', e: 'telegram' };
  const short = 'New post is live.';
  const single = versionsFor(['a', 'b', 'c', 'd', 'e'], kinds, short, true);
  assert.deepEqual(single.map((v) => [v.shape, v.channelIds.join(',')]), [['portrait', 'a,b'], ['wide', 'c,d'], ['square', 'e']]);
  const carousel = versionsFor(['a', 'b', 'c'], kinds, short, false);
  assert.deepEqual(carousel.map((v) => [v.shape, v.channelIds.join(',')]), [['native', 'a,b,c']]);
  const long = versionsFor(['a', 'c'], kinds, LONG, true);
  assert.equal(long.length, 2);
  assert.notEqual(long[0].caption, long[1].caption);
});
