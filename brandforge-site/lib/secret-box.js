'use strict';

// Encrypts small secrets (a webhook address, an app password) before they are stored, so a database
// read alone never shows them. AES-256-GCM with a random nonce per value. The key comes from
// CHANNEL_SECRET_KEY when set; otherwise it is derived from a server-only secret that already exists.
const crypto = require('node:crypto');

function keyFrom(env = process.env) {
  const base = String(env.CHANNEL_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (base.length < 16) throw new Error('secret_key_missing');
  return crypto.createHash('sha256').update(`brandforge-channels:${base}`).digest();
}

function encryptSecret(plain, env = process.env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(env), iv);
  const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')}`;
}

/** @returns {string | null} the secret, or null when it cannot be read (wrong key, tampered, bad shape) */
function decryptSecret(stored, env = process.env) {
  try {
    const value = String(stored || '');
    if (!value.startsWith('v1.')) return null;
    const raw = Buffer.from(value.slice(3), 'base64url');
    if (raw.length < 29) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(env), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encryptSecret, decryptSecret };
