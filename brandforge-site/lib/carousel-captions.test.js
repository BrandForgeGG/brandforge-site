'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PLATFORMS, buildCaptionPrompt, normalizeCaptions, fallbackCaptions, fitCaption } = require('./carousel-captions');

const plan = { cover: { headline: 'THESE *HABITS* WORK' }, items: [{ n: 1, name: 'Sleep', bullets: ['Go to bed early.'] }, { n: 2, name: 'Walk', bullets: ['Walk daily.'] }, { n: 3, name: 'Write', bullets: ['Write it down.'] }], cta: { button: 'Follow for more' } };

test('the prompt carries the carousel, every platform limit and the person\'s own call to action', () => {
  const p = buildCaptionPrompt({ plan, brandName: 'Mira', handle: '@mira', cta: 'Book a call at mira.co' });
  assert.match(p.user, /1\. Sleep: Go to bed early\./);
  assert.match(p.user, /Posting as: Mira \(@mira\)/);
  assert.match(p.user, /Book a call at mira\.co/);
  for (const key of Object.keys(PLATFORMS)) assert.match(p.user, new RegExp(`- ${key}: at most ${PLATFORMS[key].limit}`));
  assert.match(p.system, /Never mention any brand/);
});

test('captions are trimmed to each platform limit, at a boundary', () => {
  const long = 'Word '.repeat(200);
  const reply = JSON.stringify({ instagram: 'Hello there, friends! Save this.', tiktok: 'Hook first, always.', linkedin: 'A professional take.', x: long, facebook: long });
  const result = normalizeCaptions(reply);
  assert.equal(result.ok, true);
  assert.ok(result.captions.x.length <= PLATFORMS.x.limit);
  assert.ok(result.captions.facebook.length <= PLATFORMS.facebook.limit);
  assert.ok(!result.captions.x.endsWith('Wor'));
  assert.equal(normalizeCaptions('nope').ok, false);
  assert.match(normalizeCaptions(JSON.stringify({ instagram: 'only one caption here' })).error, /TikTok/);
  assert.ok(fitCaption('short', 280) === 'short');
});

test('the fallback captions come from the carousel itself and respect the limits', () => {
  const out = fallbackCaptions(plan, 'Follow for more');
  assert.match(out.instagram, /THESE HABITS WORK/);
  assert.match(out.instagram, /2\. Walk/);
  assert.ok(out.x.length <= 280);
  assert.match(out.linkedin, /Follow for more/);
});
