'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  maskEmail,
  isFreshSignup,
  buildRegistrationPayload,
  postRegistrationNotice,
} = require('./registration-notice');

test('maskEmail keeps the first letter and the domain, asterisks the middle', () => {
  assert.strictEqual(maskEmail('brandforge.gg@gmail.com'), 'b*****@gmail.com');
  assert.strictEqual(maskEmail('Mxstermind.com@gmail.com'), 'm*****@gmail.com');
});

test('maskEmail normalises case and handles short local parts', () => {
  assert.strictEqual(maskEmail('FOO@BAR.COM'), 'f*****@bar.com');
  assert.strictEqual(maskEmail('a@b.co'), 'a*****@b.co');
});

test('maskEmail refuses to pattern-match unrecognisable input', () => {
  assert.strictEqual(maskEmail(''), '•••');
  assert.strictEqual(maskEmail(null), '•••');
  assert.strictEqual(maskEmail('@domain.com'), '•••');
  assert.strictEqual(maskEmail('no-at-sign'), '•••');
});

test('isFreshSignup accepts a just-created user and rejects older ones', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert.strictEqual(isFreshSignup('2026-09-30T11:59:50Z', now), true);
  assert.strictEqual(isFreshSignup('2026-09-30T11:51:00Z', now), true);
  assert.strictEqual(isFreshSignup('2026-09-30T11:49:59Z', now), false);
  assert.strictEqual(isFreshSignup('2026-09-01T09:00:00Z', now), false);
});

test('isFreshSignup rejects junk input without throwing', () => {
  const now = Date.now();
  assert.strictEqual(isFreshSignup('not-a-date', now), false);
  assert.strictEqual(isFreshSignup(undefined, now), false);
  assert.strictEqual(isFreshSignup(null, now), false);
});

test('buildRegistrationPayload masks the email and never carries the raw address', () => {
  const payload = buildRegistrationPayload({
    email: 'founder@example.com',
    memberCount: 42,
    when: new Date('2026-09-30T12:00:00Z'),
  });

  const body = JSON.stringify(payload);
  assert.ok(!body.includes('founder@example.com'));
  assert.ok(body.includes('f*****@example.com'));
  assert.ok(body.includes('member #42'));

  const embed = payload.embeds[0];
  assert.strictEqual(payload.username, 'BrandForge');
  assert.deepStrictEqual(payload.allowed_mentions, { parse: [] });
  assert.strictEqual(embed.title, 'New member registered');
  assert.strictEqual(embed.color, 0xe8571e);
  assert.strictEqual(embed.footer.text, 'BrandForge · registrations');
  assert.strictEqual(embed.timestamp, '2026-09-30T12:00:00.000Z');
  assert.strictEqual(embed.fields.find((f) => f.name === 'Member').value, '#42');
  assert.match(embed.fields.find((f) => f.name === 'Registered').value, /2026-09-30 12:00:00/);
});

test('buildRegistrationPayload omits the count claim when the count is unknown', () => {
  const embed = buildRegistrationPayload({ email: 'x@y.com' }).embeds[0];
  assert.ok(embed.description.includes('Welcome'));
  assert.ok(!embed.description.includes('#'));
  assert.strictEqual(embed.fields.find((f) => f.name === 'Member').value, '—');
});

test('postRegistrationNotice is a silent no-op without the env var', async () => {
  const fetchImpl = () => {
    throw new Error('fetch should not be called');
  };
  const result = await postRegistrationNotice({ email: 'a@b.com', env: {}, fetchImpl });
  assert.deepStrictEqual(result, { sent: false, reason: 'not_configured' });
});

test('postRegistrationNotice posts the masked payload to the configured webhook', async () => {
  let seen = null;
  const fetchImpl = async (url, options) => {
    seen = { url, body: options.body };
    return { ok: true, status: 200, headers: { get: () => null } };
  };

  const result = await postRegistrationNotice({
    email: 'new.member@gmail.com',
    memberCount: 7,
    env: { DISCORD_REGISTRATION_URL: 'https://discord.com/api/webhooks/1/test' },
    fetchImpl,
  });

  assert.deepStrictEqual(result, { sent: true });
  assert.strictEqual(seen.url, 'https://discord.com/api/webhooks/1/test');
  assert.ok(!seen.body.includes('new.member@gmail.com'));
  assert.ok(seen.body.includes('n*****@gmail.com'));
});

test('postRegistrationNotice retries once on 429 honouring retry-after', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: false, status: 429, headers: { get: (name) => (name === 'retry-after' ? '0.001' : null) } };
    }
    return { ok: true, status: 200, headers: { get: () => null } };
  };

  const result = await postRegistrationNotice({
    email: 'a@b.com',
    env: { DISCORD_REGISTRATION_URL: 'https://discord.com/api/webhooks/1/test' },
    fetchImpl,
  });

  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(result, { sent: true });
});

test('postRegistrationNotice reports a failed answer without throwing', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, headers: { get: () => null } });
  const result = await postRegistrationNotice({
    email: 'a@b.com',
    env: { DISCORD_REGISTRATION_URL: 'https://discord.com/api/webhooks/1/test' },
    fetchImpl,
  });
  assert.deepStrictEqual(result, { sent: false, reason: 'http_500' });
});

test('postRegistrationNotice reports network failures without throwing', async () => {
  const fetchImpl = async () => {
    throw new Error('boom');
  };
  const result = await postRegistrationNotice({
    email: 'a@b.com',
    env: { DISCORD_REGISTRATION_URL: 'https://discord.com/api/webhooks/1/test' },
    fetchImpl,
  });
  assert.deepStrictEqual(result, { sent: false, reason: 'network' });
});
