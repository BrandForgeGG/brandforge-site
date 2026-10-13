'use strict';

// Makes the "Secret Key" Supabase asks for when Sign in with Apple is switched on: a JWT signed with your Apple .p8 key
// (ES256), valid for up to 180 days. Run it on your own machine; the key never leaves it and nothing is sent anywhere.
//
//   node scripts/apple-client-secret.js --team ABCDE12345 --key-id XYZ987WVUT --client-id gg.brandforge.signin --p8 ./AuthKey_XYZ987WVUT.p8
//
// Paste the printed value into Supabase (Authentication, Sign In / Providers, Apple, Secret Key). Make a new one before it
// expires: Apple sign-in stops working the day it does.
const crypto = require('node:crypto');
const fs = require('node:fs');

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? String(process.argv[index + 1] || '').trim() : '';
}

const team = arg('team');
const keyId = arg('key-id');
const clientId = arg('client-id');
const p8 = arg('p8');
const days = Math.min(180, Math.max(1, Number(arg('days')) || 180));

if (!team || !keyId || !clientId || !p8) {
  console.error('Usage: node scripts/apple-client-secret.js --team <Team ID> --key-id <Key ID> --client-id <Services ID> --p8 <path to .p8> [--days 180]');
  process.exit(1);
}

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
const payload = { iss: team, iat: now, exp: now + days * 86400, aud: 'https://appleid.apple.com', sub: clientId };
const input = `${b64(header)}.${b64(payload)}`;
const signature = crypto.sign('sha256', Buffer.from(input), { key: fs.readFileSync(p8, 'utf8'), dsaEncoding: 'ieee-p1363' }).toString('base64url');

console.log(`${input}.${signature}`);
console.error(`Valid until ${new Date((now + days * 86400) * 1000).toISOString().slice(0, 10)}. Make a new one before then.`);
