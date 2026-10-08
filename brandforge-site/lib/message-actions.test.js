const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMessageEdit,
  normalizeReactionEmoji,
  canMutateMessage,
  displayAttachmentName,
  safeDownloadName,
  parseSlashCommand,
  parseChatEmbed,
  insertComposerCommand,
  validateMessageInput,
  validateAttachment,
} = require('./message-actions.js');
test('message and attachment validation gives actionable limits', () => {
  assert.deepEqual(validateMessageInput('  hello  '), { value: 'hello' });
  assert.match(validateMessageInput('x'.repeat(8001)).error, /8,000/);
  assert.match(validateMessageInput('   ').error, /Write a message/);
  assert.deepEqual(validateAttachment({ name: 'brief.pdf', type: 'application/pdf', size: 1024 }).file.name, 'brief.pdf');
  assert.match(validateAttachment({ name: 'huge.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1 }).error, /10 MB/);
  assert.match(validateAttachment({ name: 'bad.exe', type: 'application/x-msdownload', size: 10 }).error, /not supported/);
});



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
test('parseChatEmbed normalizes every supported action embed and rejects junk', () => {
  assert.deepEqual(parseChatEmbed({ type: 'proposal', id: 'p1', status: 'pending', title: 'Site' }), { type: 'proposal', proposalId: 'p1', status: 'pending', title: 'Site' });
  assert.deepEqual(parseChatEmbed({ type: 'proposal', id: 'p1', status: 'accepted' }), { type: 'proposal', proposalId: 'p1', status: 'accepted' });
  assert.deepEqual(parseChatEmbed({ type: 'agreement', id: 'a1', status: 'pending_funding' }), { type: 'agreement', agreementId: 'a1', status: 'pending_funding' });
  assert.deepEqual(parseChatEmbed({ type: 'review_request', id: 'c1' }), { type: 'review_request', conversationId: 'c1' });
assert.deepEqual(parseChatEmbed({ type: 'review_request', id: 'c1', percent: 75, complete: false }), { type: 'review_request', conversationId: 'c1', percent: 75, complete: false });
assert.deepEqual(parseChatEmbed({ type: 'review_request', id: 'c1', percent: 'high' }), { type: 'review_request', conversationId: 'c1' });
  assert.deepEqual(parseChatEmbed({ type: 'funding', id: 'a1', status: 'verifying' }), { type: 'funding', agreementId: 'a1', status: 'verifying' });
  assert.deepEqual(parseChatEmbed({ type: 'funding', id: 'a1', status: 'released', paymentId: 'pay1' }), { type: 'funding', agreementId: 'a1', status: 'released', paymentId: 'pay1' });
  assert.equal(parseChatEmbed({ type: 'proposal' }), null);
  assert.equal(parseChatEmbed({ type: 'unknown', id: 'x' }), null);
  assert.equal(parseChatEmbed(null), null);
  assert.equal(parseChatEmbed([{ type: 'proposal', id: 'p1' }]), null);
  // Attachments must never be mistaken for embeds.
  assert.equal(parseChatEmbed({ path: 'a/b.png', name: 'b.png', size: 1, contentType: 'image/png' }), null);
});

test('parseChatEmbed carries the proposal priced-offer snapshot and drops junk', () => {
  assert.deepEqual(
    parseChatEmbed({
      type: 'proposal',
      id: 'p1',
      status: 'pending',
      title: 'CRM build',
      totalAmount: 18500,
      currency: 'EUR',
      weeksMin: 5,
      weeksMax: 6,
      scope: 'React dashboard, Postgres, auth.',
    }),
    {
      type: 'proposal',
      proposalId: 'p1',
      status: 'pending',
      title: 'CRM build',
      totalAmount: 18500,
      currency: 'EUR',
      weeksMin: 5,
      weeksMax: 6,
      scope: 'React dashboard, Postgres, auth.',
    }
  );
  // Counter snapshot passes through only with a real round number.
  assert.deepEqual(
    parseChatEmbed({
      type: 'proposal',
      id: 'p1',
      status: 'counter_back',
      counterTotalAmount: 16000,
      counterWeeksMin: 4,
      counterWeeksMax: 5,
      counterRound: 2,
      counterNote: 'Final offer.',
    }),
    {
      type: 'proposal',
      proposalId: 'p1',
      status: 'counter_back',
      counterTotalAmount: 16000,
      counterWeeksMin: 4,
      counterWeeksMax: 5,
      counterRound: 2,
      counterNote: 'Final offer.',
    }
  );
  // Hostile shapes never reach the card: non-numbers dropped, strings clipped.
  const hostile = parseChatEmbed({
    type: 'proposal',
    id: 'p1',
    status: 'pending',
    totalAmount: 'lots',
    currency: 'EUR-TOO-LONG-STRING',
    scope: 42,
    counterRound: 9,
    counterTotalAmount: NaN,
  });
  assert.deepEqual(hostile, {
    type: 'proposal',
    proposalId: 'p1',
    status: 'pending',
    currency: 'EUR-TOO-',
  });
});

test('insertComposerCommand preserves the existing draft', () => {
  assert.equal(insertComposerCommand('', '/progress'), '/progress ');
  assert.equal(insertComposerCommand('we need a landing page', '/review'), 'we need a landing page /review ');
  assert.equal(insertComposerCommand('draft  ', '/contract'), 'draft /contract ');
  assert.equal(insertComposerCommand(undefined, '/attach'), '/attach ');
});

test('parseSlashCommand recognizes delivery commands and rejects unknown commands', () => {
  assert.deepEqual(parseSlashCommand(' /progress '), { command: 'progress', args: '' });
  assert.deepEqual(parseSlashCommand('/review launch brief'), { command: 'review', args: 'launch brief' });
  assert.deepEqual(parseSlashCommand('/contract'), { command: 'contract', args: '' });
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

test('parseChatEmbed accepts a peer contract card and needs its id', () => {
  assert.deepEqual(parseChatEmbed({ type: 'peer_contract', id: 'c1', status: 'proposed' }), { type: 'peer_contract', contractId: 'c1', status: 'proposed' });
  assert.equal(parseChatEmbed({ type: 'peer_contract' }), null);
});
