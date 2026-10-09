const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoverPrompt, styleOf, STYLE_IDS } = require('./carousel-cover.js');

test('unknown styles fall back to photo; drawn makes no prompt', () => {
  assert.equal(styleOf('nope'), 'photo');
  assert.ok(STYLE_IDS.includes('drawn'));
  assert.equal(buildCoverPrompt({ scene: 'a lighthouse', style: 'drawn' }), '');
});

test('the prompt follows the scene, then the headline, and forbids text', () => {
  const a = buildCoverPrompt({ scene: 'a calm team around a table at dawn', headline: 'X', style: 'photo' });
  assert.match(a, /calm team/);
  assert.match(a, /No text/);
  const b = buildCoverPrompt({ scene: '', headline: 'HABITS OF *CALM* TEAMS', style: 'cinematic' });
  assert.match(b, /HABITS OF CALM TEAMS/);
  assert.equal(buildCoverPrompt({ style: 'photo' }), '');
});

test('variant asks for another take', () => {
  const a = buildCoverPrompt({ scene: 'a bridge', style: 'render', variant: 0 });
  const b = buildCoverPrompt({ scene: 'a bridge', style: 'render', variant: 1 });
  assert.notEqual(a, b);
});
