'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildArticlePrompt, normalizeArticle, articleMarkdown, wordCount } = require('./article.js');

const good = {
  title: 'How to plan a week of posts',
  dek: 'A simple routine that takes one hour.',
  sections: [
    { heading: 'Start with one idea', paragraphs: ['Pick the one thing you want people to remember this week and write it down.'] },
    { heading: 'Turn it into five posts', paragraphs: ['Each post looks at the idea from a different side, so it never feels repeated.'] },
    { heading: '', paragraphs: ['Dropped: no heading.'] },
  ],
  closing: 'Try it this Monday.',
};

test('a good reply becomes an article; sections without a heading are dropped', () => {
  const out = normalizeArticle(JSON.stringify(good));
  assert.equal(out.ok, true);
  assert.equal(out.article.sections.length, 2);
});

test('fenced replies are read too, thin or untitled ones are refused', () => {
  assert.equal(normalizeArticle('```json\n' + JSON.stringify(good) + '\n```').ok, true);
  assert.equal(normalizeArticle({ ...good, title: '' }).ok, false);
  assert.equal(normalizeArticle({ ...good, sections: good.sections.slice(0, 1) }).ok, false);
  assert.equal(normalizeArticle('nonsense').ok, false);
});

test('markdown has the title, the sections and the closing', () => {
  const md = articleMarkdown(normalizeArticle(good).article);
  assert.match(md, /^# How to plan a week of posts/);
  assert.match(md, /## Turn it into five posts/);
  assert.match(md, /Try it this Monday\.\n$/);
  assert.ok(wordCount(normalizeArticle(good).article) > 20);
});

test('the prompt carries the topic, the audience and the length', () => {
  const prompt = buildArticlePrompt({ topic: 'Sourdough for beginners', audience: 'home bakers', length: 'short' });
  assert.match(prompt.user, /Sourdough for beginners/);
  assert.match(prompt.user, /home bakers/);
  assert.match(prompt.user, /3 sections/);
});
