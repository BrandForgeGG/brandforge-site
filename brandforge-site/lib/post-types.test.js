const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePost, telegramHtml, telegramText, blueskyPosts, linkFacets, discordEmbed, graphemes } = require('./post-types');

test('every post type validates and rejects what is missing', () => {
  assert.equal(normalizePost({ type: 'nope' }).ok, false);
  assert.equal(normalizePost({ type: 'update', text: '' }).ok, false);
  assert.equal(normalizePost({ type: 'update', text: 'Hello team' }).ok, true);
  assert.equal(normalizePost({ type: 'poll', question: 'Which day is best?', options: ['Mon'] }).ok, false);
  assert.equal(normalizePost({ type: 'poll', question: 'Which day is best?', options: ['Mon', 'mon'] }).ok, false);
  assert.equal(normalizePost({ type: 'poll', question: 'Which day is best?', options: ['Mon', 'Tue'] }).ok, true);
  assert.equal(normalizePost({ type: 'poll', question: 'Which day is best?', options: Array.from({ length: 11 }, (_, i) => `o${i}`) }).ok, false);
  assert.equal(normalizePost({ type: 'quiz', question: 'What is 2 + 2?', options: ['3', '4'], correct: 5 }).ok, false);
  assert.equal(normalizePost({ type: 'quiz', question: 'What is 2 + 2?', options: ['3', '4'], correct: 1, explanation: 'Basic sums.' }).ok, true);
  assert.equal(normalizePost({ type: 'thread', parts: ['one'] }).ok, false);
  assert.equal(normalizePost({ type: 'thread', parts: ['one', 'two'] }).ok, true);
});

test('long answers and questions are trimmed to what every platform accepts', () => {
  const made = normalizePost({ type: 'poll', question: 'q'.repeat(400), options: ['a'.repeat(200), 'b'.repeat(200)] });
  assert.equal(made.post.question.length, 250);
  assert.equal(made.post.options[0].length, 55);
});

test('telegram html escapes input, then adds bold, code and links', () => {
  const html = telegramHtml('**Big** news <script>alert(1)</script> see https://brandforge.gg/create. `code`');
  assert.ok(html.includes('<b>Big</b>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<a href="https://brandforge.gg/create">https://brandforge.gg/create</a>.'));
  assert.ok(html.includes('<code>code</code>'));
});

test('bluesky posts stay under 300 characters, a thread is numbered, a quiz reveals its answer last', () => {
  const thread = blueskyPosts({ type: 'thread', parts: ['First', 'Second', 'Third'] });
  assert.equal(thread.length, 3);
  assert.ok(thread[0].text.endsWith('1/3'));
  const long = blueskyPosts({ type: 'update', text: 'word '.repeat(200) });
  assert.ok(graphemes(long[0].text) <= 300);
  const quiz = blueskyPosts({ type: 'quiz', question: 'What is 2 + 2?', options: ['3', '4'], correct: 1, explanation: 'Basic sums.' });
  assert.equal(quiz.length, 2);
  assert.ok(!quiz[0].text.includes('Answer: 2'));
  assert.ok(quiz[1].text.startsWith('Answer: 2. 4'));
});

test('link facets use utf-8 byte offsets so emoji before a link do not break it', () => {
  const text = '🔥 go to https://brandforge.gg now';
  const [facet] = linkFacets(text);
  const bytes = new TextEncoder().encode(text);
  assert.equal(new TextDecoder().decode(bytes.slice(facet.index.byteStart, facet.index.byteEnd)), 'https://brandforge.gg');
});

test('telegram threads and discord embeds carry every part', () => {
  const post = { type: 'thread', parts: ['alpha', 'beta'] };
  assert.ok(telegramText(post).includes('alpha') && telegramText(post).includes('beta'));
  assert.ok(discordEmbed(post).description.includes('2/2'));
});
