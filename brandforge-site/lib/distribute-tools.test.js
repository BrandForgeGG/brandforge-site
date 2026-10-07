'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOLS, GROUPS, getTool, compile } = require('./distribute-tools');
const { detectDeliverable } = require('./deliverable-intent');

test('every Distribute tool is grouped and compiles its own example', () => {
  const groupIds = new Set(GROUPS.map((group) => group.id));
  for (const tool of TOOLS) {
    assert.ok(groupIds.has(tool.group), `${tool.id} has a known group`);
    const result = compile(tool.id, tool.example);
    assert.equal(result.ok, true, `${tool.id}: ${JSON.stringify(result)}`);
    assert.ok(result.prompt.length > 30 && result.prompt.length < 1500);
  }
});

test('ad pack uses the chosen platforms, goal and tone and a real address', () => {
  assert.equal(compile('adpack', { url: 'no' }).ok, false);
  const result = compile('adpack', { url: 'bakesy.app', platforms: ['Meta', 'TikTok'], goal: 'Leads', tone: 'Bold' });
  assert.equal(result.ok, true);
  assert.match(result.prompt, /Read https:\/\/bakesy\.app\/ and build/);
  assert.match(result.prompt, /for Meta, TikTok:/);
  assert.match(result.prompt, /aimed at leads, tone bold/);
});

test('calendar asks for the table the Copy as CSV button needs', () => {
  const result = compile('calendar', { about: 'a coffee roaster', days: '7 days', platforms: ['Instagram'], cadence: 'Daily' });
  assert.match(result.prompt, /^Build a 7-day content calendar/);
  assert.match(result.prompt, /columns Day, Platform, Format, Hook, Caption and CTA/);
  assert.match(result.prompt, /Platforms: Instagram\./);
});

test('visuals batch several images and stay recognisable as ad visuals', () => {
  const many = compile('visuals', { subject: 'a ceramic mug', count: '3' });
  assert.match(many.prompt, /Create 3 different ad visuals/);
  assert.match(many.prompt, /batch true/);
  const one = compile('visuals', { subject: 'a ceramic mug', count: '1' });
  assert.doesNotMatch(one.prompt, /batch true/);
});

test('launch and outreach carry their options', () => {
  const launch = compile('launch', { what: 'a salon booking app', stage: 'Idea', channels: ['Reddit'], timeline: '1 week' });
  assert.match(launch.prompt, /Stage: idea\. Channels available: Reddit\. Timeline: 1 week\./);
  assert.equal(detectDeliverable(launch.prompt), 'launch_plan');
  const outreach = compile('outreach', { audience: 'cafe owners in Berlin', offer: 'a free kit', channel: 'LinkedIn DM', steps: '5' });
  assert.match(outreach.prompt, /5-message linkedin dm outreach sequence/);
  assert.match(outreach.prompt, /Offer: a free kit\./);
  assert.equal(getTool('nope'), null);
});

test('a reference page is read first on any Distribute tool', () => {
  const result = compile('launch', { what: 'a salon booking app', reference: 'salon.example.com' });
  assert.match(result.prompt, /read https:\/\/salon\.example\.com\/ with research_web/);
});
