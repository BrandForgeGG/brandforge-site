'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ASK, parseCallback } = require('./bot-core');
const { LABELS, menuComponents, answerComponents, modalFor, modalText } = require('./discord-ui');

test('the menu fits Discord limits and every button maps to a question', () => {
  const rows = menuComponents('https://brandforge.gg');
  assert.ok(rows.length <= 5);
  for (const row of rows) assert.ok(row.components.length <= 5);
  const ids = rows.flatMap((r) => r.components).filter((c) => c.custom_id).map((c) => c.custom_id);
  assert.equal(ids.length, 9);
  for (const id of ids) {
    const parsed = parseCallback(id);
    assert.equal(parsed.type, 'ask');
    assert.ok(modalFor(parsed.kind), id + ' opens a form');
    assert.ok(id.length <= 100);
  }
  assert.ok(rows.flatMap((r) => r.components).some((c) => c.style === 5 && c.url === 'https://brandforge.gg'));
});

test('popup labels and titles respect the 45 character cap and cover every question', () => {
  for (const kind of Object.keys(LABELS)) {
    assert.ok(LABELS[kind].length <= 45, kind);
    assert.ok(ASK[kind], kind + ' also exists as a Telegram question');
    const modal = modalFor(kind);
    assert.ok(modal.data.title.length <= 45);
    assert.equal(modal.data.custom_id, 'ask:' + kind);
  }
  assert.equal(modalFor('link'), null);
});

test('answer buttons carry follow-ups, a menu and the link back to the web', () => {
  const rows = answerComponents('https://brandforge.gg/api/blueprint/return?x=1');
  const flat = rows.flatMap((r) => r.components);
  assert.ok(flat.some((c) => c.custom_id === 'do:shorter'));
  assert.ok(flat.some((c) => c.custom_id === 'menu'));
  assert.ok(flat.some((c) => c.style === 5 && /blueprint\/return/.test(c.url)));
  for (const c of flat) if (c.label) assert.ok(c.label.length <= 80);
});

test('the submitted text is read from the popup form', () => {
  const interaction = { data: { components: [{ type: 1, components: [{ type: 4, custom_id: 'text', value: '  a booking page  ' }] }] } };
  assert.equal(modalText(interaction), 'a booking page');
  assert.equal(modalText({}), '');
});
