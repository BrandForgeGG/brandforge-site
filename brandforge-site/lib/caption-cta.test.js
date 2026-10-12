const test = require('node:test');
const assert = require('node:assert/strict');
const { KINDS, BY_FORMAT, pickCta, ctaLine, ctaPlan } = require('./caption-cta');

test('every format asks for things that suit it', () => {
  for (const format of Object.keys(BY_FORMAT)) for (const kind of BY_FORMAT[format]) assert.ok(KINDS.includes(kind), `${format} ${kind}`);
  assert.equal(pickCta({ format: 'question', seed: 1 }), pickCta({ format: 'question', seed: 1 }), 'deterministic');
  for (let i = 0; i < 20; i++) assert.ok(BY_FORMAT.ad.includes(pickCta({ format: 'ad', seed: i })), 'an ad asks to try, hire or message');
  for (let i = 0; i < 20; i++) assert.ok(BY_FORMAT.question.includes(pickCta({ format: 'question', seed: i })));
});

test('a post never asks for the same thing as the one before it', () => {
  for (let i = 0; i < 40; i++) {
    const first = pickCta({ format: 'carousel', seed: i });
    assert.notEqual(pickCta({ format: 'carousel', seed: `n${i}`, previous: first }), first);
  }
});

test('a week of posts asks for many different things', () => {
  const formats = ['quote', 'tip', 'carousel', 'ad', 'question', 'quote', 'tip', 'carousel', 'announcement', 'question', 'quote', 'tip', 'carousel', 'ad', 'question', 'quote', 'tip', 'carousel', 'announcement', 'question', 'ad'];
  const plan = ctaPlan(formats, 'week-1');
  assert.equal(plan.length, formats.length);
  for (let i = 1; i < plan.length; i++) assert.notEqual(plan[i], plan[i - 1]);
  assert.ok(new Set(plan).size >= 6, 'at least six different asks: ' + [...new Set(plan)].join());
  assert.ok(plan.includes('try') && plan.includes('hire') && plan.includes('comment') && plan.includes('save') && plan.includes('follow'));
});

test('lines carry the site and the brand, and vary in wording', () => {
  assert.match(ctaLine('try', { seed: 1, site: 'https://brandforge.gg/' }), /brandforge\.gg/);
  assert.doesNotMatch(ctaLine('try', { seed: 1, site: 'https://brandforge.gg/' }), /https|\{site\}/);
  assert.match(ctaLine('hire', { seed: 2, site: 'brandforge.gg', brand: 'BrandForge' }), /brandforge\.gg/);
  const wordings = new Set(Array.from({ length: 30 }, (_, i) => ctaLine('save', { seed: i })));
  assert.ok(wordings.size >= 3, 'several phrasings of the same ask');
  assert.equal(ctaLine('unknown', { seed: 1 }).length > 5, true);
});
