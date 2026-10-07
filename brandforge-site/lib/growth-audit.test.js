'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreFromContent, computeTotal, identifyGaps, extractMeta, AUDIT_RUBRIC } = require('./growth-audit.js');

test('extractMeta parses title and description', () => {
  const html = '<html><head><title>Acme - Best Widgets</title><meta name="description" content="Acme makes the best widgets for developers"></head></html>';
  const meta = extractMeta(html);
  assert.equal(meta.title, 'Acme - Best Widgets');
  assert.equal(meta.description, 'Acme makes the best widgets for developers');
});

test('extractMeta returns null for missing tags', () => {
  const meta = extractMeta('<html><head></head></html>');
  assert.equal(meta.title, null);
  assert.equal(meta.description, null);
});

test('scoreFromContent detects value proposition keywords', () => {
  const html = '<html><body><h1>We help businesses grow</h1><p>Our solution improves your workflow</p></body></html>';
  const scores = scoreFromContent(html, {});
  assert.ok(scores.message_clarity >= 10, `message_clarity should be >= 10, got ${scores.message_clarity}`);
});

test('scoreFromContent detects CTA keywords', () => {
  const html = '<html><body><p>Sign up now for a free trial</p><button>Buy now</button></body></html>';
  const scores = scoreFromContent(html, {});
  assert.ok(scores.offer_cta >= 10, `offer_cta should be >= 10, got ${scores.offer_cta}`);
});

test('scoreFromContent detects SEO basics', () => {
  const html = '<html><head><title>Acme - Best Widgets for Developers</title><meta name="description" content="Acme makes the best widgets for developers who want to build faster"></head><body><h1>Acme</h1></body></html>';
  const scores = scoreFromContent(html, { title: 'Acme - Best Widgets for Developers', description: 'Acme makes the best widgets for developers who want to build faster' });
  assert.ok(scores.seo_basics >= 15, `seo_basics should be >= 15, got ${scores.seo_basics}`);
});

test('scoreFromContent detects social links', () => {
  const html = '<html><body><a href="https://twitter.com/acme">Twitter</a><a href="https://facebook.com/acme">Facebook</a><a href="https://linkedin.com/company/acme">LinkedIn</a></body></html>';
  const scores = scoreFromContent(html, {});
  assert.ok(scores.social_presence >= 9, `social_presence should be >= 9, got ${scores.social_presence}`);
});

test('scoreFromContent detects ads/tracking', () => {
  const html = '<html><head><script src="https://googletagmanager.com/gtm.js?id=GTM-XXXX"></script><script>ga("create", "UA-XXXX");</script></head></html>';
  const scores = scoreFromContent(html, {});
  assert.ok(scores.ads_presence >= 7, `ads_presence should be >= 7, got ${scores.ads_presence}`);
});

test('computeTotal sums all rubric items', () => {
  const scores = {};
  for (const item of AUDIT_RUBRIC) {
    scores[item.key] = item.weight;
  }
  assert.equal(computeTotal(scores), 100);
});

test('computeTotal caps at 100', () => {
  const scores = {};
  for (const item of AUDIT_RUBRIC) {
    scores[item.key] = item.weight * 2;
  }
  assert.equal(computeTotal(scores), 100);
});

test('identifyGaps returns gaps sorted by severity', () => {
  const scores = {
    message_clarity: 0,
    offer_cta: 5,
    seo_basics: 15,
    speed: 0,
    social_presence: 15,
    ads_presence: 10,
    ai_search_visibility: 0,
  };
  const gaps = identifyGaps(scores);
  assert.ok(gaps.length > 0);
  assert.ok(gaps[0].severity === 'high');
  assert.ok(gaps[0].score / gaps[0].max <= gaps[1].score / gaps[1].max);
});

test('identifyGaps returns empty for perfect score', () => {
  const scores = {};
  for (const item of AUDIT_RUBRIC) {
    scores[item.key] = item.weight;
  }
  const gaps = identifyGaps(scores);
  assert.equal(gaps.length, 0);
});

test('identifyGaps includes fix and effort for each gap', () => {
  const scores = { message_clarity: 0 };
  const gaps = identifyGaps(scores);
  const gap = gaps.find((g) => g.key === 'message_clarity');
  assert.ok(gap);
  assert.ok(gap.fix.length > 0);
  assert.ok(['low', 'medium', 'high'].includes(gap.effort));
});
