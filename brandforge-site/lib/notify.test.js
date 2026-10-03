'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  isNotifyConfigured,
  buildMessage,
  buildPersonalMessage,
  sendTelegramMessage,
  notify,
  notifyUser,
} = require('./notify.js');

const ENV = { TELEGRAM_BOT_TOKEN: 'tok123', TELEGRAM_CHAT_ID: '-100999' };

function okFetch(captured) {
  return async (url, init) => {
    captured.url = url;
    captured.init = init;
    return { ok: true, status: 200 };
  };
}

// ---------- configuration ----------

test('isNotifyConfigured requires both env vars', () => {
  assert.equal(isNotifyConfigured({}), false);
  assert.equal(isNotifyConfigured({ TELEGRAM_BOT_TOKEN: 'x' }), false);
  assert.equal(isNotifyConfigured({ TELEGRAM_CHAT_ID: 'x' }), false);
  assert.equal(isNotifyConfigured({ TELEGRAM_BOT_TOKEN: '  ', TELEGRAM_CHAT_ID: '1' }), false);
  assert.equal(isNotifyConfigured(ENV), true);
});

// ---------- message building ----------

test('buildMessage returns null for unknown events', () => {
  assert.equal(buildMessage('nonsense', {}), null);
  assert.equal(buildMessage('', {}), null);
});

test('buildMessage covers every wired event with its key detail', () => {
  const cases = [
    ['review_requested', { percent: 80 }, '80%'],
    ['application_submitted', {}, 'New operator application received'],
    ['proposal_sent', { title: 'Landing page', totalAmount: 4000, currency: 'EUR' }, 'Landing page'],
    ['proposal_answered', { title: 'Landing page', status: 'accepted' }, 'accepted'],
    ['proposal_countered', { title: 'Landing page', totalAmount: 3200, currency: 'EUR', weeks: '4 weeks', by: 'founder' }, 'founder'],
    ['payment_submitted', { txHash: 'abc123', network: 'USDT (TRC-20)' }, 'abc123'],
    ['payment_verified', {}, 'funded'],
    ['payment_rejected', { note: 'wrong amount' }, 'wrong amount'],
    ['payment_released', { title: 'Milestone 1', amount: 2000, currency: 'EUR' }, 'Milestone 1'],
    ['task_review', { title: 'Hero section', assigneeName: 'Ana' }, 'Hero section'],
  ];

  for (const [event, details, needle] of cases) {
    const message = buildMessage(event, details);
    assert.equal(typeof message, 'string', `${event} should build a message`);
    assert.ok(message.includes(needle), `${event} message should include "${needle}": ${message}`);
  }
});

test('buildMessage formats money and omits it when absent', () => {
  const withPrice = buildMessage('proposal_sent', { title: 'X', totalAmount: 12500, currency: 'EUR' });
  assert.ok(withPrice.includes('EUR 12,500'));

  const without = buildMessage('proposal_sent', { title: 'X' });
  assert.ok(!without.includes('EUR'));

  const zero = buildMessage('payment_released', { title: 'M', amount: 0, currency: 'EUR' });
  assert.ok(!zero.includes('EUR'));
});

test('buildMessage clips hostile input to one short line', () => {
  const evil = 'a'.repeat(1000) + '\n\n<script>alert(1)</script>';
  const message = buildMessage('task_review', { title: evil, assigneeName: 'x\ny' });
  assert.ok(!message.includes('\n'), 'no newlines should survive clipping');
  assert.ok(message.length < 600);
});

// ---------- personal (operator-facing) messages ----------

test('buildPersonalMessage pings linked staff when a brief lands', () => {
  const message = buildPersonalMessage('brief_ready', { title: 'Merchant Cash Advance CRM' });
  assert.ok(message.includes('Merchant Cash Advance CRM'));
  assert.ok(message.includes('staff inbox'));
  assert.ok(!message.includes('\n'));
});

test('buildPersonalMessage covers every proposal answer an operator waits on', () => {
  const accepted = buildPersonalMessage('proposal_answered', { title: 'Landing page', status: 'accepted' });
  assert.ok(accepted.includes('accepted your proposal'));
  assert.ok(accepted.includes('added to the chat'));

  const changes = buildPersonalMessage('proposal_answered', { title: 'Landing page', status: 'changes_requested' });
  assert.ok(changes.includes('requested changes'));

  const declined = buildPersonalMessage('proposal_answered', { title: 'Landing page', status: 'declined' });
  assert.ok(declined.includes('declined'));

  const unknown = buildPersonalMessage('proposal_answered', { title: 'Landing page', status: 'reopened' });
  assert.ok(unknown.includes('reopened'));
});

test('buildPersonalMessage returns null for unknown events', () => {
  assert.equal(buildPersonalMessage('nope', {}), null);
  assert.equal(buildPersonalMessage('', {}), null);
});

test('messages link into the chat when a destination is known', () => {
  const personal = buildPersonalMessage('proposal_ready', {
    title: 'Landing page',
    conversationId: 'c1',
  });
  assert.ok(personal.includes('/chat?conversationId=c1'));

  const team = buildMessage('proposal_sent', { title: 'Landing page', conversationId: 'c2' });
  assert.ok(team.includes('/chat?conversationId=c2'));

  const without = buildPersonalMessage('proposal_ready', { title: 'Landing page' });
  assert.ok(!without.includes('/chat'));
});

test('buildPersonalMessage tells the specialist their counter is on the table', () => {
  const countered = buildPersonalMessage('proposal_countered', {
    title: 'Landing page',
    totalAmount: 3200,
    currency: 'EUR',
    weeks: '4 weeks',
  });
  assert.ok(countered.includes('countered your proposal'));
  assert.ok(countered.includes('EUR 3,200'));
  assert.ok(countered.includes('last offer'), 'the one-shot rule must be in the ping');
  assert.ok(!countered.includes('\n'));
});

test('buildPersonalMessage tells the founder the final counter is waiting', () => {
  const ready = buildPersonalMessage('counter_back_ready', {
    title: 'Landing page',
    totalAmount: 3500,
    currency: 'EUR',
    weeks: '5 weeks',
  });
  assert.ok(ready.includes('countered back'));
  assert.ok(ready.includes('EUR 3,500'));
  assert.ok(ready.includes('Accept or decline'));

  const noPrice = buildPersonalMessage('counter_back_ready', { title: 'Landing page' });
  assert.ok(noPrice.includes('countered back'));
  assert.ok(!noPrice.includes('EUR'), 'money is omitted when absent');
});

// ---------- sending ----------

test('sendTelegramMessage no-ops when not configured and never calls fetch', async () => {
  let called = false;
  const result = await sendTelegramMessage('hi', {
    env: {},
    fetchImpl: async () => {
      called = true;
      return { ok: true };
    },
  });
  assert.deepEqual(result, { sent: false, reason: 'not_configured' });
  assert.equal(called, false);
});

test('sendTelegramMessage posts to the bot API with chat id and text', async () => {
  const captured = {};
  const result = await sendTelegramMessage('hello team', { env: ENV, fetchImpl: okFetch(captured) });

  assert.deepEqual(result, { sent: true });
  assert.equal(captured.url, 'https://api.telegram.org/bottok123/sendMessage');
  assert.equal(captured.init.method, 'POST');

  const body = JSON.parse(captured.init.body);
  assert.equal(body.chat_id, '-100999');
  assert.equal(body.text, 'hello team');
  assert.equal(body.disable_web_page_preview, true);
});

test('sendTelegramMessage reports http errors without throwing', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await sendTelegramMessage('x', {
      env: ENV,
      fetchImpl: async () => ({ ok: false, status: 401 }),
    });
    assert.deepEqual(result, { sent: false, reason: 'http_401' });
  } finally {
    console.error = originalError;
  }
});

test('sendTelegramMessage reports network failures without throwing', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await sendTelegramMessage('x', {
      env: ENV,
      fetchImpl: async () => {
        throw new Error('socket hang up');
      },
    });
    assert.deepEqual(result, { sent: false, reason: 'network' });
  } finally {
    console.error = originalError;
  }
});

// ---------- public entry ----------

test('notify rejects unknown events before sending', async () => {
  const result = await notify('bogus', {}, { env: ENV, fetchImpl: okFetch({}) });
  assert.deepEqual(result, { sent: false, reason: 'unknown_event' });
});

test('notify builds and sends a real event end to end', async () => {
  const captured = {};
  const result = await notify(
    'payment_released',
    { title: 'Design phase', amount: 3000, currency: 'EUR' },
    { env: ENV, fetchImpl: okFetch(captured) }
  );

  assert.deepEqual(result, { sent: true });
  const body = JSON.parse(captured.init.body);
  assert.ok(body.text.includes('Design phase'));
  assert.ok(body.text.includes('EUR 3,000'));
});

test('pings carry an Open-chat button when the conversation is known', async () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://brandforge.gg';
  try {
    const captured = {};
    await notify(
      'proposal_sent',
      { title: 'Landing page', conversationId: 'c9' },
      { env: ENV, fetchImpl: okFetch(captured) }
    );
    const body = JSON.parse(captured.init.body);
    assert.ok(body.text.includes('/chat?conversationId=c9'));
    assert.deepEqual(body.reply_markup, {
      inline_keyboard: [[{ text: 'Open chat', url: 'https://brandforge.gg/chat?conversationId=c9' }]],
    });

    const personal = {};
    await notifyUser('12345', 'proposal_ready', { title: 'X', conversationId: 'c9' }, {
      env: { TELEGRAM_BOT_TOKEN: 'tok123' },
      fetchImpl: okFetch(personal),
    });
    const personalBody = JSON.parse(personal.init.body);
    assert.equal(personalBody.chat_id, '12345');
    assert.ok(personalBody.reply_markup.inline_keyboard[0][0].url.includes('c9'));
  } finally {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});

test('button URLs must be https and callers keep their own buttons', async () => {
  const captured = {};
  await notify(
    'proposal_sent',
    { title: 'X' },
    {
      env: ENV,
      fetchImpl: okFetch(captured),
      buttons: [
        { text: 'A', url: 'javascript:alert(1)' },
        { text: 'B', url: 'https://brandforge.gg/chat?conversationId=c1' },
      ],
    }
  );
  const body = JSON.parse(captured.init.body);
  assert.deepEqual(body.reply_markup, {
    inline_keyboard: [[{ text: 'B', url: 'https://brandforge.gg/chat?conversationId=c1' }]],
  });

  const plain = {};
  await notify('proposal_sent', { title: 'X' }, { env: ENV, fetchImpl: okFetch(plain) });
  assert.equal(JSON.parse(plain.init.body).reply_markup, undefined);
});

test('notify is a silent no-op without env so dev and CI stay quiet', async () => {
  const result = await notify('payment_verified', {}, { env: {} });
  assert.deepEqual(result, { sent: false, reason: 'not_configured' });
});

test('invite_sent reports the invite to the team chat', () => {
  const text = buildMessage('invite_sent', {
    email: 'newbie@example.com',
    conversationId: 'c-123',
    invitedBy: 'founder@brandforge.gg',
  });
  assert.ok(text.includes('newbie@example.com'));
  assert.ok(text.includes('founder@brandforge.gg'));
});

test('notify(object) is an unknown event — the signature is (event, details)', async () => {
  // Regression for the invite route, which once passed a details object as the first
  // argument and silently no-op'd every invite notification.
  const result = await notify(
    { event: 'invite_sent', email: 'x@example.com' },
    {},
    { env: ENV, fetchImpl: okFetch({}) },
  );
  assert.deepEqual(result, { sent: false, reason: 'unknown_event' });
});
