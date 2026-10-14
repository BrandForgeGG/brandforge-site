const test = require('node:test');
const assert = require('node:assert/strict');
const { KIND_IDS, FORMATS, buildImagePrompt, normalizeImageCopy, sanitizeImage, imageCaption } = require('./image-kinds');

const good = { kicker: 'New', headline: 'Stop posting *without* a hook', sub: 'The first line decides if anyone reads the rest.', button: 'Try it free', options: [], scene: 'A desk lamp lighting one handwritten page' };

test('the ten makers and five sizes exist', () => {
  assert.deepEqual(KIND_IDS, ['ad', 'quote', 'tip', 'announcement', 'question', 'cover', 'infographic', 'offer', 'event', 'pin']);
  assert.deepEqual(Object.keys(FORMATS), ['square', 'portrait', 'story', 'wide', 'pin']);
  assert.equal(FORMATS.pin.h / FORMATS.pin.w, 1.5);
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

test('each kind opens at the size it is posted at', () => {
  const { defaultFormat } = require('./image-kinds.js');
  assert.equal(defaultFormat('cover'), 'story');
  assert.equal(defaultFormat('pin'), 'pin');
  assert.equal(defaultFormat('infographic'), 'portrait');
  assert.equal(defaultFormat('quote'), 'square');
});

test('an infographic keeps 3 to 5 points and has no sub line', () => {
  const { normalizeImageCopy } = require('./image-kinds.js');
  const ok = normalizeImageCopy({ headline: 'Write a *post*', sub: 'drop me', options: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'] }, 'infographic');
  assert.equal(ok.ok, true);
  assert.equal(ok.copy.options.length, 5);
  assert.equal(ok.copy.sub, '');
  assert.equal(normalizeImageCopy({ headline: 'Too few points', options: ['One', 'Two'] }, 'infographic').ok, false);
});

test('offers, events and pins get a button; covers do not', () => {
  const { normalizeImageCopy } = require('./image-kinds.js');
  for (const kind of ['offer', 'event', 'pin']) assert.ok(normalizeImageCopy({ headline: 'Something good here' }, kind).copy.button.length > 0, kind);
  assert.equal(normalizeImageCopy({ headline: 'Something good here', button: 'Tap' }, 'cover').copy.button, '');
});
