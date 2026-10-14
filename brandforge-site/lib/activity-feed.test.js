'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { activityItem, buildActivity } = require('./activity-feed.js');

const at = '2026-10-14T10:00:00Z';

test('a new member never shows their username', () => {
  assert.equal(activityItem('joined', { at, actor: { email: 'sam@gmail.com', username: 'sam' } }).who, 'A new member');
});

test('a chat never shows its title or words', () => {
  const item = activityItem('chat', { at, title: 'Secret plan', actor: { email: 'a@b.co' } });
  assert.equal(item.text, 'started a new chat');
  assert.ok(!JSON.stringify(item).includes('Secret'));
});

test('an application shows the craft, never the name', () => {
  const item = activityItem('applied', { at, name: 'Jane Doe', specialty: 'Designer', actor: { email: 'jane@x.co' } });
  assert.equal(item.who, 'Someone');
  assert.match(item.text, /as Designer/);
});

test('staff, test accounts and test chats are left out', () => {
  assert.equal(activityItem('joined', { at, actor: { email: 'probe-1@brandforge.gg' } }), null);
  assert.equal(activityItem('chat', { at, actor: { role: 'admin' } }), null);
  assert.equal(activityItem('chat', { at, actor: { source: 'test' } }), null);
});

test('the feed is newest first and capped', () => {
  const rows = {
    joined: [{ at: '2026-10-14T09:00:00Z', actor: { email: 'a@b.co' } }],
    listing: [{ at: '2026-10-14T11:00:00Z', name: 'AE', title: 'Logo design', actor: { email: 'c@d.co' } }],
    chat: [{ at: 'not a date', actor: {} }],
  };
  const feed = buildActivity(rows, 5);
  assert.deepEqual(feed.map((item) => item.kind), ['listing', 'joined']);
  assert.equal(buildActivity(rows, 1).length, 1);
});
