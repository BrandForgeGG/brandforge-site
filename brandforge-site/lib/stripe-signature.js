'use strict';

// Stripe tells us a payment happened by calling our webhook. The call is only trusted when its signature matches:
// HMAC-SHA256 of "<timestamp>.<raw body>" with the endpoint secret, and the timestamp is recent. Pure and tested.

const crypto = require('node:crypto');

function verifyStripeSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300) {
  if (!secret || typeof header !== 'string' || typeof rawBody !== 'string') return false;
  const parts = header.split(',').map((piece) => piece.trim().split('='));
  const timestamp = Number((parts.find(([key]) => key === 't') || [])[1]);
  const candidates = parts.filter(([key]) => key === 'v1').map(([, value]) => value).filter(Boolean);
  if (!Number.isFinite(timestamp) || candidates.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(timestamp + '.' + rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return candidates.some((candidate) => {
    try {
      const given = Buffer.from(candidate, 'hex');
      return given.length === expectedBuffer.length && crypto.timingSafeEqual(given, expectedBuffer);
    } catch {
      return false;
    }
  });
}

module.exports = { verifyStripeSignature };
