'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOpsEmbed,
  buildPublicPost,
  opsWebhookUrl,
  postOpsEvent,
  postPublicActivity,
  postDevLog,
  postLiveMessage,
  weeks,
} = require('./ops-events.js');

function okFetch(captured) {
  return async (url, init) => {
    captured.url = url;
    captured.init = init;
    return { ok: true, status: 204 };
  };
}

// ---------- staff embeds ----------

test('buildOpsEmbed returns null for unknown events', () => {
  assert.equal(buildOpsEmbed('nonsense', {}), null);
});

test('every wired ops event builds a titled, colored embed', () => {
  const events = [
    'brief_posted',
    'proposal_submitted',
    'proposal_accepted',
    'proposal_declined',
    'proposal_countered',
    'match_made',
    'contract_proposed',
    'contract_signed',
    'escrow_funded',
    'escrow_rejected',
    'milestone_released',
  ];
  for (const event of events) {
    const embed = buildOpsEmbed(event, { title: 'CRM build' });
    assert.ok(embed, `${event} should build`);
    assert.ok(embed.title.length > 0, `${event} title`);
    assert.ok(typeof embed.color === 'number', `${event} color`);
    assert.ok(embed.footer.text.startsWith('BrandForge · ops-'), `${event} footer`);
  }
});

test('money and timelines render in staff embeds, omitted when absent', () => {
  const withPrice = buildOpsEmbed('proposal_submitted', {
    title: 'X',
    totalAmount: 18500,
    currency: 'EUR',
    weeksMin: 5,
    weeksMax: 6,
    authorName: 'Mxstermind',
  });
  assert.ok(withPrice.description.includes('EUR 18,500'));
  assert.ok(withPrice.description.includes('5–6 weeks'));
  assert.ok(withPrice.description.includes('Mxstermind'));

  const without = buildOpsEmbed('proposal_submitted', { title: 'X' });
  assert.ok(!without.description.includes('EUR'));
});

test('the final counter is flagged so staff know no further rounds exist', () => {
  const first = buildOpsEmbed('proposal_countered', { title: 'X', by: 'founder', round: 1 });
  assert.ok(!first.title.includes('Final'));
  assert.ok(first.description.includes('counter back once'));

  const last = buildOpsEmbed('proposal_countered', {
    title: 'X',
    by: 'specialist',
    round: 2,
    totalAmount: 900,
    currency: 'EUR',
  });
  assert.ok(last.title.includes('Final counter'));
  assert.ok(last.description.includes('negotiation_round 2 (max)'));
  assert.ok(last.description.includes('EUR 900'));
});

test('the out is named on a second decline', () => {
  const second = buildOpsEmbed('proposal_declined', { title: 'X', declinesOut: true });
  assert.ok(second.description.includes('two declines'));
  const first = buildOpsEmbed('proposal_declined', { title: 'X' });
  assert.ok(!first.description.includes('two declines'));
});

// ---------- public feed ----------

test('only the four growth-safe moments have a public template', () => {
  assert.equal(buildPublicPost('brief_posted'), 'A new project brief was posted');
  assert.equal(buildPublicPost('match_made'), 'A project was matched with a team');
  assert.equal(buildPublicPost('contract_funded'), 'A project was matched and funded');
  assert.equal(buildPublicPost('milestone_released'), 'A milestone shipped');
  for (const hidden of [
    'proposal_submitted',
    'proposal_accepted',
    'proposal_declined',
    'proposal_countered',
    'contract_signed',
    'escrow_funded',
    'escrow_rejected',
    'match_made_nope',
  ]) {
    assert.equal(buildPublicPost(hidden), null, `${hidden} must never go public`);
  }
});

// ---------- routing ----------

test('ops webhook resolution prefers kind, then base, then skips', () => {
  const kind = { DISCORD_OPS_PROPOSALS_URL: 'kind', DISCORD_OPS_URL: 'base', DISCORD_WEBHOOK_URL: 'legacy' };
  assert.equal(opsWebhookUrl('proposals', kind), 'kind');
  assert.equal(opsWebhookUrl('proposals', { DISCORD_OPS_URL: 'base', DISCORD_WEBHOOK_URL: 'legacy' }), 'base');
  // The legacy discovery channel is never an ops fallback: ops noise does not
  // belong in the specialists' briefs feed.
  assert.equal(opsWebhookUrl('proposals', { DISCORD_WEBHOOK_URL: 'legacy' }), null);
  assert.equal(opsWebhookUrl('proposals', {}), null);
  // Matches have their own channel per the spec (identities cross there).
  assert.equal(opsWebhookUrl('matches', { DISCORD_OPS_MATCHES_URL: 'm', DISCORD_OPS_URL: 'base' }), 'm');
  assert.equal(opsWebhookUrl('matches', { DISCORD_OPS_URL: 'base' }), 'base');
});

// ---------- sending ----------

test('postOpsEvent posts a ping-free embed to the routed webhook', async () => {
  const captured = {};
  const result = await postOpsEvent(
    'proposal_countered',
    { title: 'X', by: 'specialist', round: 2 },
    { env: { DISCORD_OPS_URL: 'https://discord/ops' }, fetchImpl: okFetch(captured) }
  );
  assert.deepEqual(result, { sent: true, ok: true });
  assert.equal(captured.url, 'https://discord/ops');
  const body = JSON.parse(captured.init.body);
  assert.deepEqual(body.allowed_mentions, { parse: [] });
  assert.ok(body.embeds[0].title.includes('Final counter'));
});

test('postOpsEvent rejects unknown events and stays quiet unconfigured', async () => {
  let called = false;
  const never = async () => {
    called = true;
    return { ok: true };
  };
  assert.deepEqual(await postOpsEvent('bogus', {}, { env: {}, fetchImpl: never }), {
    sent: false,
    reason: 'unknown_event',
  });
  assert.deepEqual(await postOpsEvent('proposal_accepted', { title: 'X' }, { env: {}, fetchImpl: never }), {
    sent: false,
    reason: 'not_configured',
  });
  assert.equal(called, false);
});

test('postOpsEvent reports network failures without throwing', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await postOpsEvent('proposal_accepted', { title: 'X' }, {
      env: { DISCORD_OPS_URL: 'https://discord/ops' },
      fetchImpl: async () => {
        throw new Error('socket hang up');
      },
    });
    assert.deepEqual(result, { sent: false, reason: 'network' });
  } finally {
    console.warn = originalWarn;
  }
});

test('postPublicActivity posts content-only lines and refuses private events', async () => {
  const captured = {};
  const result = await postPublicActivity('match_made', {
    env: { DISCORD_LIVE_URL: 'https://discord/live' },
    fetchImpl: okFetch(captured),
  });
  assert.deepEqual(result, { sent: true, ok: true });
  const body = JSON.parse(captured.init.body);
  assert.equal(body.content, 'A project was matched with a team');
  assert.equal(body.embeds, undefined, 'public posts carry no embeds');

  let called = false;
  const never = async () => {
    called = true;
    return { ok: true };
  };
  assert.deepEqual(await postPublicActivity('proposal_declined', { env: { DISCORD_LIVE_URL: 'x' }, fetchImpl: never }), {
    sent: false,
    reason: 'not_public',
  });
  assert.deepEqual(await postPublicActivity('match_made', { env: {}, fetchImpl: never }), {
    sent: false,
    reason: 'not_configured',
  });
  assert.equal(called, false);
});

test('milestone shipments prefer the milestones channel, else the live feed', async () => {  const captured = {};
  await postPublicActivity('milestone_released', {
    env: { DISCORD_MILESTONE_URL: 'https://discord/mile', DISCORD_LIVE_URL: 'https://discord/live' },
    fetchImpl: okFetch(captured),
  });
  assert.equal(captured.url, 'https://discord/mile');

  const captured2 = {};
  await postPublicActivity('milestone_released', {
    env: { DISCORD_LIVE_URL: 'https://discord/live' },
    fetchImpl: okFetch(captured2),
  });
  assert.equal(captured2.url, 'https://discord/live');
});

test('postDevLog stays quiet without a dev-log webhook', async () => {
  const result = await postDevLog({ title: 'Shipped: x' }, { env: {} });
  assert.deepEqual(result, { sent: false, reason: 'not_configured' });
});

test('postLiveMessage sends clipped plain text, never empty', async () => {
  const captured = {};
  const result = await postLiveMessage('This week: 2 posted.', {
    env: { DISCORD_LIVE_URL: 'https://discord/live' },
    fetchImpl: okFetch(captured),
  });
  assert.deepEqual(result, { sent: true, ok: true });
  const body = JSON.parse(captured.init.body);
  assert.equal(body.content, 'This week: 2 posted.');
  assert.equal(body.embeds, undefined);

  assert.deepEqual(await postLiveMessage('   ', { env: { DISCORD_LIVE_URL: 'x' }, fetchImpl: okFetch({}) }), {
    sent: false,
    reason: 'empty',
  });
  assert.deepEqual(await postLiveMessage('hi', { env: {}, fetchImpl: okFetch({}) }), {
    sent: false,
    reason: 'not_configured',
  });
});

test('weeks renders ranges, singles and nothing for garbage', () => {
  assert.equal(weeks(3, 3), '3 weeks');
  assert.equal(weeks(2, 6), '2–6 weeks');
  assert.equal(weeks(4, 2), '4 weeks', 'inverted max falls back to min');
  assert.equal(weeks(null, null), null);
  assert.equal(weeks(0, 4), null);
  assert.equal(weeks('soon', 'later'), null);
});
