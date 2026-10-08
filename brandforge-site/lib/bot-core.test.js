'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { botSessionId, parseCommand, commandToPrompt, looksLikeLinkCode, toPlainChat, collectStreamText, parseIdList } = require('./bot-core');
const { createSessionToken, verifySessionToken } = require('./blueprint-session');

test('one person on one platform always maps to the same valid guest session', () => {
  const a = botSessionId('telegram', 12345, 'secret');
  assert.equal(a, botSessionId('telegram', '12345', 'secret'));
  assert.notEqual(a, botSessionId('telegram', 12346, 'secret'));
  assert.notEqual(a, botSessionId('discord', 12345, 'secret'));
  assert.notEqual(a, botSessionId('telegram', 12345, 'other'));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // It is accepted as a real session id by the existing session token code.
  assert.equal(verifySessionToken(createSessionToken(a, 'secret'), 'secret'), a);
});

test('commands become the same starting phrases as the web Actions menu', () => {
  assert.deepEqual(parseCommand('/plan@BrandForgeBot a yoga studio booking page'), { name: 'plan', args: 'a yoga studio booking page' });
  assert.equal(parseCommand('hello'), null);
  assert.equal(commandToPrompt(parseCommand('/image a ceramic mug on a shelf')).prompt, 'Create an image: a ceramic mug on a shelf');
  assert.equal(commandToPrompt(parseCommand('/image a ceramic mug on a shelf')).media, true);
  assert.equal(commandToPrompt(parseCommand('/audit https://bakesy.app')).prompt, 'Audit this site and tell me what to fix first: https://bakesy.app');
  assert.deepEqual(commandToPrompt(parseCommand('/ads')), { ok: false, needs: 'what you are advertising', media: false });
  assert.equal(commandToPrompt(parseCommand('/nope something')), null);
});

test('link codes need a digit so eight-letter words are not mistaken for one', () => {
  assert.equal(looksLikeLinkCode('k7m2q9xd'), true);
  assert.equal(looksLikeLinkCode('bakeries'), false);
  assert.equal(looksLikeLinkCode('k7m2q9x'), false);
});

test('answers are flattened to plain chat text and kept under the limit', () => {
  const text = toPlainChat('## Goal\n**Launch** the shop.\n\n- Day 1: set up\n- Day 2: post\n\n| Day | Plan |\n|---|---|\n| 1 | Teaser |\n\nSee [the guide](https://x.co/g).');
  assert.ok(!text.includes('**') && !text.includes('##'));
  assert.ok(text.includes('• Day 1: set up'));
  assert.ok(text.includes('1 · Teaser'));
  assert.ok(text.includes('the guide (https://x.co/g)'));
  assert.ok(toPlainChat('x'.repeat(9000), 3500).length <= 3504);
});

test('the chat stream is collected, retractions honoured, errors surfaced', () => {
  const sse = ['data: {"type":"activity","label":"Read page"}', 'data: {"type":"chunk","chunk":"scaffold"}', 'data: {"type":"discard"}', 'data: {"type":"chunk","chunk":"Hello "}', 'data: {"type":"chunk","chunk":"there."}'].join('\n\n');
  assert.deepEqual(collectStreamText(sse), { text: 'Hello there.', error: null });
  assert.equal(collectStreamText('data: {"type":"error","error":"Daily limit"}').error, 'Daily limit');
});

test('id lists parse from env text', () => {
  assert.deepEqual(parseIdList(' 7000000001, 7000000002 ,'), ['7000000001', '7000000002']);
  assert.deepEqual(parseIdList(undefined), []);
});
