'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOLS, GROUPS, getTool, defaultValues, compile } = require('./create-tools');
const { detectDeliverable } = require('./deliverable-intent');

test('every tool belongs to a known group and compiles its own example', () => {
  const groupIds = new Set(GROUPS.map((group) => group.id));
  for (const tool of TOOLS) {
    assert.ok(groupIds.has(tool.group), `${tool.id} has a known group`);
    const result = compile(tool.id, tool.example);
    assert.equal(result.ok, true, `${tool.id} example compiles: ${JSON.stringify(result)}`);
    assert.ok(result.prompt.length > 20 && result.prompt.length < 1500, `${tool.id} prompt length`);
  }
});

test('image options are carried into the request, multi-image asks for a batch', () => {
  const one = compile('image', { subject: 'a red bicycle at dawn', style: '3D render', format: 'Landscape', count: '1' });
  assert.match(one.prompt, /^Create an image: a red bicycle at dawn\./);
  assert.match(one.prompt, /Style: 3D render\./);
  assert.match(one.prompt, /Format: landscape\./);
  assert.doesNotMatch(one.prompt, /batch true/);
  const many = compile('image', { subject: 'a red bicycle at dawn', count: '3' });
  assert.match(many.prompt, /^Create 3 different images:/);
  assert.match(many.prompt, /batch true/);
});

test('video request is recognised as the video deliverable and keeps its scene count', () => {
  const result = compile('video', { topic: 'a bookshop called Paper Moon', scenes: '4', style: 'Illustration', tone: 'Playful' });
  assert.equal(result.ok, true);
  assert.equal(detectDeliverable(result.prompt), 'video');
  assert.match(result.prompt, /Use 4 scenes\./);
});

test('strategy: auto lets the AI choose, a named framework is used', () => {
  assert.match(compile('strategy', { situation: 'flat sales at a cafe' }).prompt, /choose the best framework/);
  const named = compile('strategy', { situation: 'flat sales at a cafe', framework: 'TOWS', market: 'German coffee' });
  assert.match(named.prompt, /^Run a TOWS analysis:/);
  assert.match(named.prompt, /Market: German coffee\./);
  assert.equal(detectDeliverable(named.prompt), 'strategy');
});

test('audit needs a real address and normalises it', () => {
  assert.equal(compile('audit', { url: 'nothing' }).ok, false);
  const ok = compile('audit', { url: 'bakesy.app', focus: ['SEO'] });
  assert.equal(ok.ok, true);
  assert.match(ok.prompt, /https:\/\/bakesy\.app\//);
  assert.match(ok.prompt, /covering seo\./);
});

test('required text must have some substance', () => {
  const result = compile('plan', { idea: 'x' });
  assert.equal(result.ok, false);
  assert.equal(result.field, 'idea');
});

test('a reference page is added to any tool, and a bad one is refused', () => {
  const ok = compile('copy', { about: 'our new latte', reference: 'ember.example.com' });
  assert.equal(ok.ok, true);
  assert.match(ok.prompt, /read https:\/\/ember\.example\.com\/ with research_web/);
  const bad = compile('copy', { about: 'our new latte', reference: 'not a url' });
  assert.equal(bad.ok, false);
  assert.equal(bad.field, 'reference');
});

test('defaults come from the field definitions and are copies', () => {
  const tool = getTool('audit');
  const first = defaultValues(tool);
  first.focus.push('extra');
  assert.equal(defaultValues(tool).focus.includes('extra'), false);
  assert.equal(getTool('nope'), null);
});
