'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateListing, budgetLabel, matches } = require('./trade');
const { formatMoney } = require('./peer-contract');

const good = {
  kind: 'offer',
  category: 'Video and motion',
  title: 'Short-form video editing',
  description: 'I cut Reels and Shorts for small brands, captions included, two-day turnaround.',
  budgetMin: '200',
  budgetMax: '600',
};

test('a complete listing validates and converts the budget to cents', () => {
  const r = validateListing(good);
  assert.equal(r.ok, true);
  assert.equal(r.value.budgetMinCents, 20000);
  assert.equal(r.value.budgetMaxCents, 60000);
  assert.equal(budgetLabel(r.value, formatMoney), '€200.00 to €600.00');
});

test('bad listings explain what is wrong', () => {
  assert.equal(validateListing({ ...good, kind: 'sell' }).ok, false);
  assert.equal(validateListing({ ...good, category: 'Crypto' }).ok, false);
  assert.equal(validateListing({ ...good, title: 'Hi' }).ok, false);
  assert.equal(validateListing({ ...good, description: 'Too short' }).ok, false);
  assert.equal(validateListing({ ...good, budgetMin: '900' }).ok, false);
  assert.equal(validateListing({ ...good, budgetMin: 'abc' }).ok, false);
  assert.equal(budgetLabel({ budgetMinCents: null, budgetMaxCents: null, currency: 'EUR' }, formatMoney), 'Open to offers');
});

test('filters match kind, category and every search word', () => {
  const listing = { kind: 'offer', category: 'Video and motion', title: 'Reels editing', description: 'Captions included' };
  assert.equal(matches(listing, { kind: 'offer' }), true);
  assert.equal(matches(listing, { kind: 'request' }), false);
  assert.equal(matches(listing, { q: 'reels captions' }), true);
  assert.equal(matches(listing, { q: 'reels logo' }), false);
});
