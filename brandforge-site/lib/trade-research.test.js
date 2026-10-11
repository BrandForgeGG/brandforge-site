const test = require('node:test');
const assert = require('node:assert/strict');
const { extractUrls, buildListingPrompt, normalizeNotes, isRichDescription } = require('./trade-research');

test('finds the page a person points to, with or without https', () => {
  assert.deepEqual(extractUrls('I own this. https://infinitycreativemedia.co.uk'), ['https://infinitycreativemedia.co.uk']);
  assert.deepEqual(extractUrls('selling infinitycreativemedia.co.uk, great site.'), ['https://infinitycreativemedia.co.uk']);
  assert.deepEqual(extractUrls('see www.example.com/work and https://example.com/about'), ['https://www.example.com/work']);
  assert.deepEqual(extractUrls('see https://a.io, https://b.io and https://c.io', 2), ['https://a.io', 'https://b.io']);
});

test('ignores emails, versions and plain words', () => {
  assert.deepEqual(extractUrls('mail me at hello@brand.com'), []);
  assert.deepEqual(extractUrls('version 1.2.3 is out'), []);
  assert.deepEqual(extractUrls('I edit short videos for small brands'), []);
  assert.deepEqual(extractUrls(''), []);
});

test('the prompt carries the page text and says when nothing could be read', () => {
  const withPage = buildListingPrompt({ text: 'I own this', pages: [{ url: 'https://x.test', title: 'X Studio', text: 'We make brand films in Leeds.' }], snippets: [{ title: 'X Studio', snippet: 'Brand films' }] });
  assert.match(withPage.user, /We make brand films in Leeds/);
  assert.match(withPage.user, /Web search results/);
  assert.match(withPage.system, /Never invent/);
  assert.match(buildListingPrompt({ text: 'I own https://x.test' }).user, /No page could be read/);
});

test('notes are clamped', () => {
  const notes = normalizeNotes({ found: ['a', '', 'b', 'c', 'd', 'e', 'f'], tips: ['x'.repeat(300), 'y', 'z', 'w'] });
  assert.equal(notes.found.length, 5);
  assert.equal(notes.tips.length, 3);
  assert.equal(notes.tips[0].length, 110);
  assert.deepEqual(normalizeNotes(null), { found: [], tips: [] });
});

test('a rich description has length and a list', () => {
  assert.equal(isRichDescription('I own this site.'), false);
  assert.equal(isRichDescription('A hook that says what it is and who it is for, in one clear line of plain text.\n\nWhat you get\n• One\n• Two\n• Three\n\nGood for: small teams who need a site fast and want to take it over without a rebuild.'), true);
});
