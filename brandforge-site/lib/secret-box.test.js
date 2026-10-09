'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptSecret, decryptSecret } = require('./secret-box');

const env = { SUPABASE_SERVICE_ROLE_KEY: 'a-long-server-only-secret-value-1234567890' };

test('a secret round-trips and the stored text shows nothing of it', () => {
  const stored = encryptSecret('https://discord.com/api/webhooks/123/abc-token', env);
  assert.match(stored, /^v1\./);
  assert.ok(!stored.includes('discord'));
  assert.equal(decryptSecret(stored, env), 'https://discord.com/api/webhooks/123/abc-token');
  assert.notEqual(encryptSecret('same', env), encryptSecret('same', env), 'a fresh nonce each time');
});

test('a wrong key, a tampered value or junk reads as nothing, never as garbage', () => {
  const stored = encryptSecret('hello', env);
  assert.equal(decryptSecret(stored, { SUPABASE_SERVICE_ROLE_KEY: 'another-secret-value-that-is-long-enough' }), null);
  const flipped = stored.slice(0, -2) + (stored.endsWith('A') ? 'BB' : 'AA');
  assert.equal(decryptSecret(flipped, env), null);
  assert.equal(decryptSecret('nonsense', env), null);
  assert.equal(decryptSecret('', env), null);
  assert.throws(() => encryptSecret('x', {}), /secret_key_missing/);
});
