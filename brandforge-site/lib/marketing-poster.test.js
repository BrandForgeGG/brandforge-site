'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveDestination,
  discordPayload,
  telegramPayload,
  publishPost,
} = require('./marketing-poster.js');

const ENV = {
  DISCORD_MILESTONE_URL: 'https://discord.com/api/webhooks/111/token-a',
  DISCORD_LIVE_URL: 'https://discord.com/api/webhooks/222/token-b',
  DISCORD_PUBLIC_CHANGELOG_URL: 'https://discord.com/api/webhooks/333/token-c',
  DISCORD_DEVLOG_URL: 'https://discord.com/api/webhooks/444/token-d',
  TELEGRAM_BOT_TOKEN: 'bot-token-123',
};

test('discord targets resolve to the matching webhook, case/hash insensitive', () => {
  for (const target of ['milestones', 'Milestones', '#milestones', ' live ']) {
    const result = resolveDestination('discord', target, ENV);
    assert.ok(result.ok, `${target} resolves`);
  }
  assert.equal(resolveDestination('discord', 'milestones', ENV).url, ENV.DISCORD_MILESTONE_URL);
  assert.equal(resolveDestination('discord', 'live', ENV).url, ENV.DISCORD_LIVE_URL);
});

test('discord targets survive pasted separators (fullwidth dot, bullets, arrows)', () => {
  for (const target of ['・milestones', '＃milestones', '• live', '· public-changelog', '> devlog', 'live・']) {
    const result = resolveDestination('discord', target, ENV);
    assert.ok(result.ok, `${target} resolves`);
  }
  assert.equal(resolveDestination('discord', '・milestones', ENV).url, ENV.DISCORD_MILESTONE_URL);
});

test('unknown or unconfigured discord targets fail terminally with a reason', () => {
  const unknown = resolveDestination('discord', 'nope', ENV);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.terminal, true);
  assert.ok(unknown.error.includes('Unknown Discord target'), unknown.error);

  const missing = resolveDestination('discord', 'briefs', ENV);
  assert.equal(missing.ok, false);
  assert.ok(missing.error.includes('DISCORD_OPS_BRIEFS_URL'), missing.error);
});

test('a non-webhook value in env is refused', () => {
  const result = resolveDestination('discord', 'milestones', {
    DISCORD_MILESTONE_URL: 'https://evil.example.com/hook',
  });
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('not a Discord webhook'), result.error);
});

test('telegram accepts @handles and numeric ids, refuses junk', () => {
  const handle = resolveDestination('telegram', '@BrandForge_gg', ENV);
  assert.ok(handle.ok);
  assert.equal(handle.chatId, '@BrandForge_gg');

  const numeric = resolveDestination('telegram', '-1001234567', ENV);
  assert.ok(numeric.ok);
  assert.equal(numeric.chatId, '-1001234567');

  for (const junk of ['plain text', '@x', 'https://t.me/x', '']) {
    const result = resolveDestination('telegram', junk, ENV);
    assert.equal(result.ok, false, `junk accepted: ${junk}`);
  }

  const noToken = resolveDestination('telegram', '@BrandForge_gg', { TELEGRAM_BOT_TOKEN: '' });
  assert.equal(noToken.ok, false);
  assert.ok(noToken.error.includes('TELEGRAM_BOT_TOKEN'));
});

test('reddit and unknown channels are terminal refusals', () => {
  const reddit = resolveDestination('reddit', 'r/indiehackers', ENV);
  assert.equal(reddit.ok, false);
  assert.equal(reddit.terminal, true);
  assert.ok(reddit.error.includes('Reddit'));

  const other = resolveDestination('carrier-pigeon', 'x', ENV);
  assert.equal(other.ok, false);
  assert.equal(other.terminal, true);
});

test('discord payload clips and carries title, body and link', () => {
  const payload = discordPayload({
    body: 'x'.repeat(5000),
    title: 'Milestone shipped',
    url: 'https://brandforge.gg',
  });
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].title, 'Milestone shipped');
  assert.equal(payload.embeds[0].url, 'https://brandforge.gg');
  assert.ok(payload.embeds[0].description.length <= 4000, 'body clipped');

  const bare = discordPayload({ body: 'hello' });
  assert.equal(bare.embeds[0].title, undefined);
  assert.equal(bare.embeds[0].url, undefined);
});

test('telegram payload is plain text with title and link', () => {
  const payload = telegramPayload('@BrandForge_gg', {
    body: 'Shipped.',
    title: 'Update',
    url: 'https://brandforge.gg/x',
  });
  assert.equal(payload.chat_id, '@BrandForge_gg');
  assert.equal(payload.text, 'Update\nShipped.\n\nhttps://brandforge.gg/x');
  assert.equal(payload.parse_mode, undefined, 'no markdown mode — plain text never parse-fails');
});

test('publishPost posts to discord and reports http failures', async () => {
  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 204 };
  };
  const post = { channel: 'discord', target: 'milestones', body: 'It shipped', title: 'T' };

  const ok = await publishPost(post, ENV, okFetch);
  assert.deepEqual(ok, { ok: true });
  assert.equal(calls[0].url, ENV.DISCORD_MILESTONE_URL);
  assert.equal(calls[0].body.embeds[0].description, 'It shipped');

  const bad = await publishPost(post, ENV, async () => ({ ok: false, status: 429 }));
  assert.equal(bad.ok, false);
  assert.ok(bad.error.includes('429'), bad.error);
});

test('publishPost surfaces telegram API-level errors (body.ok false)', async () => {
  const result = await publishPost(
    { channel: 'telegram', target: '@BrandForge_gg', body: 'hi' },
    ENV,
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, description: 'chat not found' }),
    })
  );
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('chat not found'), result.error);
});

test('publishPost treats thrown network errors as retryable', async () => {
  const result = await publishPost(
    { channel: 'discord', target: 'milestones', body: 'hi' },
    ENV,
    async () => {
      throw new Error('ECONNRESET');
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.terminal, undefined, 'network errors are retryable');
  assert.ok(result.error.includes('ECONNRESET'));
});
