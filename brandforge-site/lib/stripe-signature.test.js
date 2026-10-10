const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyStripeSignature } = require('./stripe-signature');

const secret = 'whsec_test';
const body = '{"id":"evt_1","type":"checkout.session.completed"}';
const now = 1_800_000_000;
const sign = (t, payload = body, key = secret) => crypto.createHmac('sha256', key).update(t + '.' + payload).digest('hex');

test('a correctly signed, recent call is trusted', () => {
  assert.equal(verifyStripeSignature(body, 't=' + now + ',v1=' + sign(now), secret, now), true);
  assert.equal(verifyStripeSignature(body, 't=' + now + ',v1=deadbeef,v1=' + sign(now), secret, now), true);
});

test('everything else is refused', () => {
  assert.equal(verifyStripeSignature(body + ' ', 't=' + now + ',v1=' + sign(now), secret, now), false);
  assert.equal(verifyStripeSignature(body, 't=' + now + ',v1=' + sign(now, body, 'other'), secret, now), false);
  assert.equal(verifyStripeSignature(body, 't=' + (now - 3600) + ',v1=' + sign(now - 3600), secret, now), false);
  assert.equal(verifyStripeSignature(body, 'v1=' + sign(now), secret, now), false);
  assert.equal(verifyStripeSignature(body, '', secret, now), false);
  assert.equal(verifyStripeSignature(body, 't=' + now + ',v1=' + sign(now), '', now), false);
});
