'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeDraft, sanitizeBrand } = require('./carousel-draft');

const plan = { cover: { headline: 'THESE *HABITS* WORK' }, items: [1, 2, 3].map((n) => ({ n, name: 'Item ' + n, bullets: ['One', 'Two', 'Three'] })), cta: { headline: 'GO', button: 'Follow', note: '' } };

test('a draft is clamped: unknown theme and type fall back, junk brand fields are dropped, captions are capped', () => {
  const result = sanitizeDraft({ plan, type: 'weird', theme: 'neon', brand: { name: ' Mira  Studio ', handle: '@mira', accent: 'red', logo: 'data:...' }, captions: { x: 'y'.repeat(900), instagram: 'Hello', nope: 'dropped' }, plannedFor: '2026-11-01T09:00:00Z' });
  assert.equal(result.ok, true);
  assert.equal(result.draft.type, 'list');
  assert.equal(result.draft.theme, 'forge');
  assert.deepEqual(result.draft.brand, { name: 'Mira Studio', handle: '@mira', accent: '' });
  assert.equal(result.draft.captions.x.length, 280);
  assert.equal(result.draft.captions.nope, undefined);
  assert.equal(result.draft.plannedFor, '2026-11-01T09:00:00.000Z');
  assert.equal(result.draft.title, 'THESE HABITS WORK');
});

test('an unreadable plan or bad date is refused or ignored', () => {
  assert.equal(sanitizeDraft({ plan: { cover: {} } }).ok, false);
  assert.equal(sanitizeDraft({}).ok, false);
  assert.equal(sanitizeDraft({ plan, plannedFor: 'not a date' }).draft.plannedFor, null);
  assert.equal(sanitizeBrand({ accent: '#FF6A2B' }).accent, '#ff6a2b');
});
