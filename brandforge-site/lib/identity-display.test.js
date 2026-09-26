const test = require('node:test');
const assert = require('node:assert');

const { avatarLabel, avatarTone, formatRole, initialsFor } = require('./identity-display.js');

test('initialsFor derives stable initials from single and multi-part names', () => {
  assert.equal(initialsFor('Mxstermind'), 'MX');
  assert.equal(initialsFor('Ada Lovelace'), 'AL');
  assert.equal(initialsFor('  Amine  Benali  '), 'AB');
  assert.equal(initialsFor('cher'), 'CH');
});

test('initialsFor falls back to a question mark instead of inventing a person', () => {
  assert.equal(initialsFor(''), '?');
  assert.equal(initialsFor(null), '?');
  assert.equal(initialsFor('   '), '?');
});

test('avatarTone is deterministic across sessions for the same key', () => {
  const first = avatarTone('user-42');
  const second = avatarTone('user-42');

  assert.deepEqual(first, second);
  assert.notEqual(first.backgroundColor, undefined);
  assert.notEqual(first.color, undefined);
});

test('avatarTone only returns muted palette tones', () => {
  for (const key of ['a', 'user-1', 'Ada Lovelace', '', null]) {
    const tone = avatarTone(key);
    assert.match(tone.backgroundColor, /^#[0-9a-f]{6}$/i);
    assert.match(tone.color, /^#[0-9a-f]{6}$/i);
  }

  // Different keys spread across the palette rather than one flat color.
  const tones = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((key) => avatarTone(key).backgroundColor));
  assert.ok(tones.size > 1, 'expected more than one distinct tone');
});

test('avatarLabel names the person only when a name exists', () => {
  assert.equal(avatarLabel('Mxstermind'), "Mxstermind's avatar");
  assert.equal(avatarLabel(''), 'Avatar');
  assert.equal(avatarLabel(null), 'Avatar');
});

test('formatRole capitalizes without relabeling', () => {
  assert.equal(formatRole('founder'), 'Founder');
  assert.equal(formatRole('operator'), 'Operator');
  assert.equal(formatRole('COO · Product'), 'COO · Product');
  assert.equal(formatRole(''), '');
  assert.equal(formatRole(null), '');
});
