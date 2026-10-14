'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { VIDEO_FORMATS, planToScenes, fitToVoice, totalSeconds, sceneAt, readSeconds } = require('./video-scenes.js');

const plan = {
  cover: { headline: 'Write a *better* hook', subtitle: 'Three things that work' },
  items: [
    { n: 1, name: 'Start with the problem', bullets: ['Name what hurts', 'In their words'] },
    { n: 2, name: 'Make one promise', bullets: ['Only one'] },
    { n: 3, name: 'Cut the warm-up', bullets: [] },
  ],
  cta: { headline: 'Try it on your next post', button: 'Follow for more' },
};

test('a plan becomes an opening, one scene per point, and a close', () => {
  const scenes = planToScenes(plan, 'short');
  assert.deepEqual(scenes.map((scene) => scene.kind), ['title', 'point', 'point', 'point', 'end']);
  assert.equal(scenes[0].heading, 'Write a better hook');
  assert.ok(scenes.every((scene) => scene.seconds >= 2));
});

test('a short video stays under a minute and keeps its close', () => {
  const big = { ...plan, items: Array.from({ length: 12 }, (_, i) => ({ n: i, name: `Point number ${i} with several words in it`, bullets: ['A long supporting line that takes a while to read out loud', 'And another one'] })) };
  const scenes = planToScenes(big, 'short');
  assert.ok(scenes.length <= VIDEO_FORMATS.short.maxScenes);
  assert.equal(scenes[scenes.length - 1].kind, 'end');
  assert.ok(totalSeconds(scenes) <= VIDEO_FORMATS.short.maxSeconds + 0.5);
});

test('scenes wait for a longer voice-over', () => {
  const scenes = planToScenes(plan, 'short');
  const fitted = fitToVoice(scenes, [10, 0]);
  assert.equal(fitted[0].seconds, 10.5);
  assert.equal(fitted[1].seconds, scenes[1].seconds);
});

test('the scene on screen at a moment is found, and the end holds', () => {
  const scenes = [{ seconds: 2 }, { seconds: 3 }];
  assert.deepEqual(sceneAt(scenes, 0.5), { index: 0, local: 0.5, start: 0 });
  assert.deepEqual(sceneAt(scenes, 2.5), { index: 1, local: 0.5, start: 2 });
  assert.equal(sceneAt(scenes, 99).index, 1);
});

test('reading time grows with the words, within bounds', () => {
  assert.equal(readSeconds(''), 2.6);
  assert.ok(readSeconds('one two three four five six seven eight nine ten eleven twelve') > 4);
  assert.equal(readSeconds('word '.repeat(500)), 12);
});
