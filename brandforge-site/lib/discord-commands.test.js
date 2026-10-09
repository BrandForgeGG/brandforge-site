'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { COMMAND, applicationIdFromToken, inviteUrl } = require('./discord-commands');

test('the command needs no options, so a bare /brandforge opens the menu', () => {
  assert.equal(COMMAND.name, 'brandforge');
  assert.ok(COMMAND.options.every((option) => option.required === false));
  assert.deepEqual(COMMAND.integration_types, [0, 1]);
});

test('the application id comes from the token and the invite asks for the commands scope', () => {
  const token = Buffer.from('1234567890123456').toString('base64') + '.abc.def';
  assert.equal(applicationIdFromToken(token), '1234567890123456');
  const url = inviteUrl('1234567890123456');
  assert.match(url, /client_id=1234567890123456/);
  assert.match(url, /scope=bot%20applications\.commands/);
  assert.equal(inviteUrl(''), '');
});
