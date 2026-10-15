'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeVideo, sanitizeArticle, isKeptPath } = require('./video-embed.js');
const { parseChatEmbed } = require('./message-actions.js');

const OWNER = '11111111-2222-3333-4444-555555555555';
const PATH = `${OWNER}/kept/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4`;

test('a video keeps its maker, state, kept path and YouTube link', () => {
  const v = sanitizeVideo({ maker: 'launch', title: ' My launch ', state: { scenes: [{ kind: 'hook' }] }, videoPath: PATH, seconds: 38.61, vertical: true, youtubeUrl: 'https://www.youtube.com/watch?v=x', coverUrl: 'https://cdn.test/p.jpg' });
  assert.equal(v.maker, 'launch');
  assert.equal(v.title, 'My launch');
  assert.equal(v.videoPath, PATH);
  assert.equal(v.seconds, 38.6);
  assert.equal(v.youtubeUrl, 'https://www.youtube.com/watch?v=x');
});

test('a video refuses unknown makers, missing state and foreign links', () => {
  assert.equal(sanitizeVideo({ maker: 'movie', state: {} }), null);
  assert.equal(sanitizeVideo({ maker: 'short' }), null);
  const v = sanitizeVideo({ maker: 'short', state: {}, videoPath: '../etc/passwd', youtubeUrl: 'https://evil.test/watch', coverUrl: 'http://plain.test/a.jpg' });
  assert.equal(v.videoPath, undefined);
  assert.equal(v.youtubeUrl, undefined);
  assert.equal(v.coverUrl, undefined);
});

test('a state too large to keep is refused', () => {
  assert.equal(sanitizeVideo({ maker: 'short', state: { big: 'x'.repeat(200_000) } }), null);
});

test('kept paths belong to their owner', () => {
  assert.equal(isKeptPath(PATH, OWNER), true);
  assert.equal(isKeptPath(PATH, '99999999-2222-3333-4444-555555555555'), false);
  assert.equal(isKeptPath(`${OWNER}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4`), false);
});

test('an article keeps its sections and settings', () => {
  const a = sanitizeArticle({ article: { title: 'Ship it', dek: 'Why', sections: [{ heading: 'One', paragraphs: ['A', ''] }, { heading: '', paragraphs: [] }], closing: 'Done' }, topic: 'shipping', length: 'long' });
  assert.equal(a.title, 'Ship it');
  assert.equal(a.article.sections.length, 1);
  assert.deepEqual(a.article.sections[0].paragraphs, ['A']);
  assert.equal(a.length, 'long');
  assert.equal(sanitizeArticle({ article: { title: 'x', sections: [] } }), null);
});

test('the transcript reads video and article messages back', () => {
  const video = parseChatEmbed({ type: 'video', id: 'm1', maker: 'square', title: 'Hi', state: { a: 1 } });
  assert.equal(video.type, 'video');
  assert.equal(video.maker, 'square');
  const article = parseChatEmbed({ type: 'article', id: 'm2', article: { title: 'Title', sections: [{ heading: 'H', paragraphs: ['P'] }] } });
  assert.equal(article.type, 'article');
  assert.equal(parseChatEmbed({ type: 'video', id: 'm3', maker: 'nope', state: {} }), null);
});
