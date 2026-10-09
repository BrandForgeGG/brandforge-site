'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProfile, toHandle, safeUrl } = require('./specialist-profile');

const good = { handle: 'Mira-Designs', displayName: ' Mira  Okafor ', headline: 'Motion designer for game studios', bio: 'Ten years of trailers.', skills: 'After Effects, Blender, After Effects', portfolio: [{ title: 'Reel', url: 'https://example.com/reel' }, { title: 'Bad', url: 'javascript:alert(1)' }, { title: '', url: 'https://x.co' }], isPublic: true };

test('a profile is cleaned: handle lowercased, duplicates and unsafe links dropped', () => {
  const result = validateProfile(good);
  assert.equal(result.ok, true);
  assert.equal(result.value.handle, 'mira-designs');
  assert.equal(result.value.displayName, 'Mira Okafor');
  assert.deepEqual(result.value.skills, ['After Effects', 'Blender']);
  assert.deepEqual(result.value.portfolio, [{ title: 'Reel', url: 'https://example.com/reel' }]);
  assert.equal(result.value.isPublic, true);
});

test('missing or reserved pieces come back as a plain sentence', () => {
  assert.match(validateProfile({ ...good, handle: 'me' }).error, /handle/);
  assert.match(validateProfile({ ...good, handle: 'a' }).error, /handle/);
  assert.match(validateProfile({ ...good, displayName: '' }).error, /name/);
  assert.match(validateProfile({ ...good, headline: 'hi' }).error, /headline/);
});

test('helpers', () => {
  assert.equal(toHandle('  Hello World! '), 'hello-world');
  assert.equal(safeUrl('ftp://x.co'), null);
  assert.equal(safeUrl('https://x.co/a'), 'https://x.co/a');
});
