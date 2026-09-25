const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMessageEdit,
  normalizeReactionEmoji,
  canMutateMessage,
  displayAttachmentName,
  safeDownloadName,
  parseSlashCommand,
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

test('attachment download names hide storage UUIDs and sanitize unsafe characters', () => {
  assert.equal(displayAttachmentName('550e8400-e29b-41d4-a716-446655440000-report final.pdf'), 'report final.pdf');
  assert.equal(displayAttachmentName('plain.txt'), 'plain.txt');
  assert.equal(safeDownloadName('my file(1).pdf'), 'my_file_1_.pdf');
});

test('image attachments are inline while other files remain downloads', () => {
  assert.equal('inline; filename="hero.png"', `inline; filename="${safeDownloadName('hero.png')}"`);
  assert.equal('attachment; filename="notes.pdf"', `attachment; filename="${safeDownloadName('notes.pdf')}"`);
});

test('canMutateMessage allows only the original live human sender', () => {
test('parseSlashCommand recognizes delivery commands and rejects unknown commands', () => {
  assert.deepEqual(parseSlashCommand(' /progress '), { command: 'progress', args: '' });
  assert.deepEqual(parseSlashCommand('/review launch brief'), { command: 'review', args: 'launch brief' });
  assert.deepEqual(parseSlashCommand('/wat'), { error: 'Unknown command /wat' });
  assert.equal(parseSlashCommand('hello'), null);
});


  const message = { id: 'm1', sender_id: 'u1', sender_type: 'user', content_type: 'text' };
  assert.equal(canMutateMessage(message, 'u1'), true);
  assert.equal(canMutateMessage(message, 'u2'), false);
  assert.equal(canMutateMessage({ ...message, sender_type: 'ai' }, 'u1'), false);
  assert.equal(canMutateMessage({ ...message, content_type: 'system' }, 'u1'), false);
  assert.equal(canMutateMessage({ ...message, deleted_at: new Date().toISOString() }, 'u1'), false);
});
