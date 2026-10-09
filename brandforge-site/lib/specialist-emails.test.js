'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSpecialistEmail } = require('./specialist-emails');

test('the invitation names the steps, carries the sign-in link and escapes the note', () => {
  const mail = buildSpecialistEmail('invited', { name: 'Mira', inviteNote: '<b>We loved your reel</b>', signInUrl: 'https://brandforge.gg/login' });
  assert.match(mail.subject, /invited/i);
  assert.match(mail.text, /Hi Mira,/);
  assert.match(mail.text, /1\. Sign in with this email address/);
  assert.ok(mail.html.includes('https://brandforge.gg/login'));
  assert.ok(!mail.html.includes('<b>We loved'), 'the note is escaped');
});

test('the welcome after acceptance points to profile, inbox and Telegram, and unknown kinds return null', () => {
  const mail = buildSpecialistEmail('accepted', {});
  assert.match(mail.text, /profile and portfolio/);
  assert.match(mail.text, /Open your inbox/);
  assert.match(mail.text, /Telegram/);
  assert.equal(buildSpecialistEmail('nope'), null);
});
