const test = require('node:test');
const assert = require('node:assert/strict');
const { KIND_IDS, FORMATS, buildImagePrompt, normalizeImageCopy, sanitizeImage, imageCaption } = require('./image-kinds');

const good = { kicker: 'New', headline: 'Stop posting *without* a hook', sub: 'The first line decides if anyone reads the rest.', button: 'Try it free', options: [], scene: 'A desk lamp lighting one handwritten page' };

test('the five makers and four sizes exist', () => {
  assert.deepEqual(KIND_IDS, ['ad', 'quote', 'tip', 'announcement', 'question']);
  assert.deepEqual(Object.keys(FORMATS), ['square', 'portrait', 'story', 'wide']);
  assert.equal(FORMATS.story.h / FORMATS.story.w, 1920 / 1080);
});

test('the prompt carries the kind and pins the button when the person gave one', () => {
  const p = buildImagePrompt({ kind: 'ad', topic: 'a bakery', button: 'Order now' });
  assert.match(p.user, /Ad/);
  assert.match(p.user, /exactly: Order now/);
  assert.equal(buildImagePrompt({ kind: 'nope', topic: 'x' }).kind, 'ad');
});

test('model replies are read defensively and clamped per kind', () => {
  const ad = normalizeImageCopy(JSON.stringify(good), 'ad');
  assert.equal(ad.ok, true);
  assert.equal(ad.copy.button, 'Try it free');
  const quote = normalizeImageCopy('```json\n' + JSON.stringify(good) + '\n```', 'quote');
  assert.equal(quote.copy.button, '');
  assert.equal(quote.copy.sub, '');
  assert.equal(normalizeImageCopy('not json', 'ad').ok, false);
  assert.equal(normalizeImageCopy(JSON.stringify({ headline: 'ok' }), 'ad').ok, false);
  assert.equal(normalizeImageCopy(JSON.stringify({ headline: 'Which do you prefer', options: ['one'] }), 'question').ok, false);
  const poll = normalizeImageCopy(JSON.stringify({ headline: 'Which do you prefer today', options: ['Tea', 'Coffee', 'Water', 'Juice', 'Soda'] }), 'question');
  assert.deepEqual(poll.copy.options, ['Tea', 'Coffee', 'Water', 'Juice']);
  assert.equal(normalizeImageCopy(JSON.stringify(good), 'ad', { button: 'Order now' }).copy.button, 'Order now');
});

test('stray asterisks are balanced', () => {
  assert.equal(normalizeImageCopy(JSON.stringify({ headline: 'Make it *great' }), 'tip').copy.headline, 'Make it great');
});

test('sanitizeImage keeps good fields and refuses junk', () => {
  const ok = sanitizeImage({ kind: 'ad', format: 'story', copy: good, theme: 'rose', coverStyle: 'cinematic', brand: { name: 'BrandForge' }, topic: 'x', coverUrl: 'https://x.test/a.jpg' });
  assert.equal(ok.format, 'story');
  assert.equal(ok.theme, 'rose');
  assert.equal(ok.coverUrl, 'https://x.test/a.jpg');
  assert.equal(sanitizeImage({ kind: 'ad', copy: good, coverUrl: 'javascript:alert(1)' }).coverUrl, undefined);
  assert.equal(sanitizeImage({ kind: 'ad', format: 'huge', copy: good }).format, 'square');
  assert.equal(sanitizeImage({ kind: 'zzz', copy: good }), null);
  assert.equal(sanitizeImage({ kind: 'ad', copy: { headline: 'a' } }), null);
  assert.equal(sanitizeImage({ kind: 'question', copy: { headline: 'Which one today', options: ['one'] } }), null);
  assert.equal(sanitizeImage(null), null);
});

test('captions read well per kind', () => {
  const poll = sanitizeImage({ kind: 'question', copy: { headline: 'Tea or coffee', options: ['Tea', 'Coffee'] } });
  assert.match(imageCaption(poll), /A\) Tea\nB\) Coffee/);
  const quote = sanitizeImage({ kind: 'quote', copy: { headline: 'Done beats perfect' } });
  assert.equal(imageCaption(quote, 'brandforge.gg'), '"Done beats perfect"\n\nbrandforge.gg');
});
