'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractOutline } = require('./deliverable-outline');

const PLAN = `**Goal:** Successfully launch [Your SaaS Name] to gain traction.
**Assuming:** Target users are [segment], launch is [date].

### Pre-launch (2 weeks)
- **Week 1:**
  - Build a landing page.
  - Reach out to influencers.
- **Week 2:**
  - Run ads.

### Launch Week
- Day 1: Announce.
- Day 2: Webinar.

### Metrics to Watch
1. Sign-ups.
2. Engagement.
3. Referrals.
`;

test('reads goal, assumptions and sections with item counts', () => {
  const outline = extractOutline(PLAN);
  assert.equal(outline.goal, 'Successfully launch [Your SaaS Name] to gain traction.');
  assert.match(outline.assumptions, /^Target users are/);
  assert.deepEqual(
    outline.sections.map((section) => section.title),
    ['Pre-launch (2 weeks)', 'Launch Week', 'Metrics to Watch'],
  );
  assert.deepEqual(outline.sections.map((section) => section.items), [5, 2, 3]);
});

test('accepts bold-only headings and plain Goal lines', () => {
  const outline = extractOutline('Goal: Ship it\n\n**Phase one**\n- a\n- b\n');
  assert.equal(outline.goal, 'Ship it');
  assert.deepEqual(outline.sections, [{ title: 'Phase one', items: 2 }]);
});

test('returns null for chatter and empty input', () => {
  assert.equal(extractOutline('Sure, happy to help with that.'), null);
  assert.equal(extractOutline(''), null);
  assert.equal(extractOutline(undefined), null);
});

test('caps the number of sections', () => {
  const many = Array.from({ length: 30 }, (_, i) => `## Section ${i}\n- x`).join('\n');
  assert.equal(extractOutline(many).sections.length <= 12, true);
});
