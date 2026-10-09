const test = require('node:test');
const assert = require('node:assert/strict');
const { CREATIONS, GROUPS } = require('./creation-catalog');
const { FORMATS } = require('./format-catalog');

test('creations have no platform, known groups, unique numbers that never collide with formats', () => {
  const groups = new Set(GROUPS.map((g) => g.id));
  const formatNumbers = new Set(FORMATS.map((f) => f.n));
  const seen = new Set();
  for (const c of CREATIONS) {
    assert.equal(c.platform, '', `${c.name} names no platform`);
    assert.ok(groups.has(c.group), `${c.name} group`);
    assert.ok(!seen.has(c.n) && !formatNumbers.has(c.n), `${c.name} number is unique`);
    seen.add(c.n);
  }
});

test('only live creations open a tool; text tools carry no platform', () => {
  for (const c of CREATIONS) {
    if (c.status === 'live') assert.ok(c.tool, `${c.name} needs a tool`);
    else assert.ok(!c.tool, `${c.name} is not live`);
    if (c.tool && c.tool.kind === 'post') assert.equal(c.tool.platform, undefined);
  }
});
