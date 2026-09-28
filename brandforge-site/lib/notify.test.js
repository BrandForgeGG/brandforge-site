'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  isNotifyConfigured,
  buildMessage,
  sendTelegramMessage,
  notify,
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
    ['application_submitted', { email: 'a@b.co' }, 'a@b.co'],
    ['proposal_sent', { title: 'Landing page', totalAmount: 4000, currency: 'EUR' }, 'Landing page'],
    ['proposal_answered', { title: 'Landing page', status: 'accepted' }, 'accepted'],
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
