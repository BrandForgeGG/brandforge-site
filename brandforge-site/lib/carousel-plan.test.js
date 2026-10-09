'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlanPrompt, normalizePlan, extractJson, LIMITS } = require('./carousel-plan');

test('the prompt carries the request, the count limits and, for pages, the only facts allowed', () => {
  const words = buildPlanPrompt({ mode: 'words', topic: 'five habits of calm founders', count: 5 });
  assert.equal(words.count, 5);
  assert.match(words.user, /five habits of calm founders/);
  assert.match(words.system, /Never invent numbers/);
  const page = buildPlanPrompt({ mode: 'url', sourceTitle: 'Acme', sourceText: 'Acme makes anvils. '.repeat(3000), count: 99 });
  assert.equal(page.count, LIMITS.items);
  assert.ok(page.user.length < LIMITS.source + 600);
  assert.match(page.user, /Page title: Acme/);
  assert.equal(buildPlanPrompt({ mode: 'words', topic: 'x', count: 1 }).count, LIMITS.minItems);
});

test('a model reply is read from fenced or chatty output and clamped to slide sizes', () => {
  const reply = '```json\n' + JSON.stringify({
    cover: { headline: 'THESE *HABITS* CHANGE EVERYTHING FOR FOUNDERS WHO READ THIS WHOLE LONG TITLE ALL THE WAY', subtitle: '5 habits' },
    items: [
      { name: 'Sleep first and always, no matter what the calendar says', bullets: ['One', 'Two', 'Three', 'Four'] },
      { name: 'Walk', bullets: ['A short one.'] },
      { name: 'Write', bullets: ['x'.repeat(300), 'b', 'c'] },
      { name: '', bullets: ['dropped'] },
    ],
    cta: { headline: 'FOLLOW *NOW**', button: 'Follow', note: 'Free.' },
  }) + '\n```';
  const result = normalizePlan(reply, { count: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.plan.items.length, 3);
  assert.equal(result.plan.items[0].bullets.length, 3);
  assert.ok(result.plan.items[0].name.length <= LIMITS.name);
  assert.ok(result.plan.items[2].bullets[0].length <= LIMITS.bullet);
  assert.deepEqual(result.plan.items.map((i) => i.n), [1, 2, 3]);
  assert.ok(!/\*\*/.test(result.plan.cta.headline));
  assert.equal((result.plan.cover.headline.match(/\*/g) || []).length % 2, 0);
});

test('unreadable, headline-less or too-short plans are refused with a plain reason', () => {
  assert.equal(normalizePlan('not json at all').ok, false);
  assert.match(normalizePlan({ cover: {}, items: [] }).error, /headline/);
  assert.match(normalizePlan({ cover: { headline: 'A fine hook' }, items: [{ name: 'One', bullets: ['x'] }] }).error, /few items/);
  assert.equal(extractJson('text {"a":1} more').a, 1);
  assert.equal(extractJson(''), null);
});

test('the post type shapes the brief, and news is the only type that needs a source', () => {
  const { TYPES } = require('./carousel-plan');
  assert.equal(Object.values(TYPES).filter((t) => t.needsSource).length, 1);
  assert.equal(TYPES.news.needsSource, true);
  const funny = buildPlanPrompt({ mode: 'words', type: 'funny', topic: 'Mondays', count: 5 });
  assert.match(funny.user, /Post type: Funny/);
  assert.equal(buildPlanPrompt({ mode: 'words', type: 'nonsense', topic: 'x' }).type, 'list');
});

test("the person's own closing line is used exactly, and the model cannot name a brand", () => {
  const prompt = buildPlanPrompt({ mode: 'words', topic: 'candles', cta: 'Order at acme-candles.com' });
  assert.match(prompt.user, /acme-candles\.com/);
  assert.match(prompt.system, /Never mention any brand, website or handle/);
  const reply = { cover: { headline: 'A fine hook' }, items: [{ name: 'A', bullets: ['x'] }, { name: 'B', bullets: ['y'] }, { name: 'C', bullets: ['z'] }], cta: { headline: 'BUY *NOW*', button: 'Visit brandforge.gg', note: 'Made by us' } };
  const withOwn = normalizePlan(reply, { cta: 'Order at acme-candles.com' });
  assert.equal(withOwn.plan.cta.button, 'Order at acme-candles.com');
  assert.equal(withOwn.plan.cta.note, '');
  assert.equal(normalizePlan(reply).plan.cta.button, 'Visit brandforge.gg');
});
