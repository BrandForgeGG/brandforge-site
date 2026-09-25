const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMessageEdit,
  normalizeReactionEmoji,
  canMutateMessage,
} = require('./message-actions.js');

test('normalizeMessageEdit trims and bounds human edits', () => {
  assert.equal(normalizeMessageEdit('  corrected copy  '), 'corrected copy');
  assert.equal(normalizeMessageEdit('   '), null);
  assert.equal(normalizeMessageEdit('x'.repeat(8001)), null);
});

test('normalizeReactionEmoji accepts compact emoji sequences', () => {
  assert.equal(normalizeReactionEmoji(' 👍 '), '👍');
  assert.equal(normalizeReactionEmoji('❤️'), '❤️');
  assert.equal(normalizeReactionEmoji('👨‍👩‍👧‍👦'), '👨‍👩‍👧‍👦');
  assert.equal(normalizeReactionEmoji(''), null);
  assert.equal(normalizeReactionEmoji('👍👍👍👍👍'), '👍👍👍👍👍');
});

test('canMutateMessage allows only the original live human sender', () => {
  const message = { id: 'm1', sender_id: 'u1', sender_type: 'user', content_type: 'text' };
  assert.equal(canMutateMessage(message, 'u1'), true);
  assert.equal(canMutateMessage(message, 'u2'), false);
  assert.equal(canMutateMessage({ ...message, sender_type: 'ai' }, 'u1'), false);
  assert.equal(canMutateMessage({ ...message, content_type: 'system' }, 'u1'), false);
  assert.equal(canMutateMessage({ ...message, deleted_at: new Date().toISOString() }, 'u1'), false);
});
