'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectDeliverable, deliverableDirective } = require('./deliverable-intent');

test('recognises the starter requests', () => {
  assert.equal(detectDeliverable('Launch plan for my SaaS'), 'launch_plan');
  assert.equal(detectDeliverable('Ads for my online store selling candles'), 'ads');
  assert.equal(detectDeliverable('Audit this website: https://example.com'), 'audit');
  assert.equal(detectDeliverable('Build a 30-day content calendar for this'), 'calendar');
  assert.equal(detectDeliverable('Write a cold email sequence for founders'), 'outreach');
  assert.equal(detectDeliverable('Draft a brand starter kit'), 'brand_kit');
  assert.equal(detectDeliverable('Research 3 competitors for my app'), 'competitors');
  assert.equal(detectDeliverable('Turn this into a researched blueprint'), 'plan');
});

test('create a video is its own deliverable, ads for TikTok are not', () => {
  assert.equal(detectDeliverable('Create a video: my candle shop'), 'video');
  assert.equal(detectDeliverable('make a short video about our launch'), 'video');
  assert.equal(detectDeliverable('Produce a promo reel for the cafe'), 'video');
  assert.equal(detectDeliverable('Create ads: TikTok and Meta for my store'), 'ads');
  assert.match(deliverableDirective('Create a video: my shop'), /generate_image exactly three times/);
});

test('strategy frameworks are recognised and carry the selection guidance', () => {
  assert.equal(detectDeliverable('Run a SWOT for my bakery'), 'strategy');
  assert.equal(detectDeliverable('Do a Porter\'s Five Forces on the meal-kit market'), 'strategy');
  assert.equal(detectDeliverable('Run a strategy analysis: my coffee roaster'), 'strategy');
  assert.equal(detectDeliverable('gap analysis for our onboarding'), 'strategy');
  const text = deliverableDirective('Run a PESTLE for fintech in Germany');
  assert.match(text, /TOWS/);
  assert.match(text, /SOAR/);
  assert.match(text, /top 3 actions/);
  // Ordinary competitor requests are not swallowed by the strategy kind.
  assert.equal(detectDeliverable('Research 3 competitors for my app'), 'competitors');
});

test('ordinary conversation is not a deliverable', () => {
  assert.equal(detectDeliverable('hi'), null);
  assert.equal(detectDeliverable('what does escrow mean?'), null);
  assert.equal(detectDeliverable('yes please'), null);
  assert.equal(detectDeliverable(''), null);
  assert.equal(detectDeliverable(undefined), null);
});

test('directive demands the work first and bans question lists and invented claims', () => {
  const text = deliverableDirective('Launch plan for my SaaS');
  assert.match(text, /DELIVERABLE MODE/);
  assert.match(text, /a launch plan/);
  assert.match(text, /never send a numbered list of questions/);
  assert.match(text, /Never invent offers/);
  assert.match(text, /Pre-launch/);
  assert.equal(deliverableDirective('thanks'), '');
});
