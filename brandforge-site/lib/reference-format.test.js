'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findCuts, pacingOf, normalizeFormat, formatRules, buildReferencePrompt } = require('./reference-format.js');
const { buildLaunchPrompt } = require('./launch-video.js');

test('findCuts finds hard cuts and merges a flash into one', () => {
  const diffs = [0.01, 0.02, 0.5, 0.01, 0.02, 0.01, 0.6, 0.55, 0.02, 0.01];
  assert.deepEqual(findCuts(diffs, 4), [0.75, 1.75]);
});

test('findCuts sees text changing on a still background', () => {
  const diffs = [0.004, 0.003, 0.005, 0.058, 0.015, 0.004, 0.003, 0.03, 0.004, 0.005];
  assert.deepEqual(findCuts(diffs, 4), [1, 2]);
});

test('findCuts ignores slow motion and noise', () => {
  assert.deepEqual(findCuts([0.05, 0.06, 0.07, 0.08, 0.06, 0.05], 4), []);
  assert.deepEqual(findCuts('nope', 4), []);
});

test('pacingOf turns cuts into shots and spoken pace', () => {
  const p = pacingOf({ duration: 30, cuts: [2, 4, 6, 40, -1], words: 75 });
  assert.equal(p.shots, 4);
  assert.equal(p.avgShot, 7.5);
  assert.equal(p.firstCut, 2);
  assert.equal(p.wpm, 150);
  assert.equal(pacingOf({ duration: 10, cuts: [], words: 0 }).wpm, 0);
});

test('normalizeFormat keeps known choices only and bounds every field', () => {
  const measured = { seconds: 24, shots: 12, avgShot: 2, wpm: 170 };
  const f = normalizeFormat('```json\n{"hookStyle":"result","tone":"bold","beats":["hook","features","nonsense","cta","cta"],"hook":"x".repeat(400),"summary":"Fast product demo"}\n```'.replace('"x".repeat(400)', `"${'x'.repeat(400)}"`), measured);
  assert.equal(f.hookStyle, 'result');
  assert.equal(f.tone, 'bold');
  assert.deepEqual(f.beats, ['hook', 'features', 'cta']);
  assert.equal(f.hook.length, 120);
  assert.equal(f.seconds, 24);
  const odd = normalizeFormat({ hookStyle: 'evil', tone: 'loud', beats: ['features'] }, measured);
  assert.equal(odd.hookStyle, '');
  assert.equal(odd.tone, '');
  assert.deepEqual(odd.beats, []);
  assert.match(odd.summary, /24s, fast cuts, 170 words a minute/);
  assert.equal(normalizeFormat({}, null), null);
});

test('formatRules turn the format into writer rules without copying content', () => {
  const f = normalizeFormat({ hookStyle: 'problem', beats: ['hook', 'problem', 'features', 'cta'], cta: 'One action, the link said aloud' }, { seconds: 20, shots: 10, avgShot: 2, wpm: 160 });
  const rules = formatRules(f).join('\n');
  assert.match(rules, /never its words/);
  assert.match(rules, /about 20 seconds/);
  assert.match(rules, /Pain first/);
  assert.match(rules, /Set tour, steps, proof to null/);
  assert.deepEqual(formatRules(null), []);
  const prompt = buildLaunchPrompt({ site: null, about: 'A tool for bakers', hasPictures: false, tone: 'bold', rules: formatRules(f) });
  assert.match(prompt.system, /reference video/);
});

test('buildReferencePrompt asks for a pattern, never the words', () => {
  const p = buildReferencePrompt({ pacing: { seconds: 20, shots: 10, avgShot: 2, firstCut: 1.2, wpm: 0 }, transcript: '' });
  assert.match(p.system, /Never copy its words/);
  assert.match(p.user, /No speech/);
});
