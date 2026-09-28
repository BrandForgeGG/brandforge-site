const test = require('node:test');
const assert = require('node:assert/strict');

const { discoveryMessage, notifyDiscordDiscovery } = require('./discord');

test('message links the chat, falls back to a title, and never pings', () => {
  const msg = discoveryMessage({
    title: '   ',
    conversationId: 'conv-42',
  });
  assert.equal(msg.allowed_mentions.parse.length, 0);
  assert.equal(msg.embeds[0].title, 'Untitled project');
  assert.ok(msg.embeds[0].url.includes('/chat?conversationId=conv-42'));
  assert.equal(msg.embeds[0].color, 0xe8571e);
  assert.ok(msg.embeds[0].timestamp);
});

test('a real title is used verbatim and the embed links the conversation', () => {
  const msg = discoveryMessage({
    title: 'App Development',
    conversationId: 'abc',
  });
  assert.equal(msg.embeds[0].title, 'App Development');
  assert.ok(msg.embeds[0].url.endsWith('conversationId=abc'));
});

test('titles longer than the Discord limit are sliced', () => {
  const msg = discoveryMessage({
    title: 'x'.repeat(400),
    conversationId: 'c',
  });
  assert.equal(msg.embeds[0].title.length, 256);
});

test('without a configured webhook the notify is a skip, not an error', async () => {
  const previous = process.env.DISCORD_WEBHOOK_URL;
  delete process.env.DISCORD_WEBHOOK_URL;
  try {
    const result = await notifyDiscordDiscovery('c1', 'T');
    assert.deepEqual(result, { skipped: true });
  } finally {
    if (previous !== undefined) process.env.DISCORD_WEBHOOK_URL = previous;
  }
});

test('notify posts the message and reports ok / failure without throwing', async (t) => {
  const previous = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_WEBHOOK_URL = 'https://example.invalid/hook';
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    if (previous !== undefined) process.env.DISCORD_WEBHOOK_URL = previous;
    else delete process.env.DISCORD_WEBHOOK_URL;
  });

  let posted = null;
  global.fetch = async (url, init) => {
    posted = { url, body: JSON.parse(init.body) };
    return { ok: true, status: 204 };
  };
  const ok = await notifyDiscordDiscovery('c9', 'Title');
  assert.deepEqual(ok, { ok: true });
  assert.equal(posted.url, 'https://example.invalid/hook');
  assert.equal(posted.body.embeds[0].title, 'Title');

  global.fetch = async () => ({ ok: false, status: 429 });
  assert.deepEqual(await notifyDiscordDiscovery('c9', 'T'), { ok: false });

  global.fetch = async () => { throw new Error('boom'); };
  assert.deepEqual(await notifyDiscordDiscovery('c9', 'T'), { ok: false });
});
