const test = require('node:test');
const assert = require('node:assert/strict');
const { nextSequenceEmail } = require('./email-sequences');

const now = new Date('2026-10-20T12:00:00Z');
const ago = (days) => new Date(now.getTime() - days * 86400000);
const base = { optIn: true, hasCarousel: false, hasChat: false, sent: [], now };

test('nobody is emailed unless they opted in', () => {
  assert.equal(nextSequenceEmail({ ...base, optIn: false, createdAt: ago(1.5) }), null);
});

test('day one asks for the first carousel, and only for someone who has not made one', () => {
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(1.5) }), 'seq_first_carousel');
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(1.5), hasCarousel: true }), null);
});

test('too new, and too old, get nothing', () => {
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(0.5) }), null);
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(60) }), null);
});

test('a step is never sent twice, and the next waits two days', () => {
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(1.5), sent: ['seq_first_carousel'] }), null);
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(3.5), sent: ['seq_first_carousel'], lastSentAt: ago(1) }), null);
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(3.5), sent: ['seq_first_carousel'], lastSentAt: ago(2.5) }), 'seq_hooks');
});

test('a person who joined weeks ago is not sent day-one mail', () => {
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(12) }), null);
});

test('the week plan only goes to people who made a carousel; the check-in only to people who did not', () => {
  const sent = ['seq_first_carousel', 'seq_hooks'];
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(8), sent, hasCarousel: true }), 'seq_week');
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(8), sent, hasCarousel: false }), null);
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(15), sent: [...sent, 'seq_week'] }), 'seq_checkin');
  assert.equal(nextSequenceEmail({ ...base, createdAt: ago(15), sent: [...sent, 'seq_week'], hasCarousel: true }), null);
});

test('bad dates never throw', () => {
  assert.equal(nextSequenceEmail({ ...base, createdAt: 'not a date' }), null);
  assert.equal(nextSequenceEmail(null), null);
});
