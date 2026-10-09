const test = require('node:test');
const assert = require('node:assert/strict');
const { FORMATS, GROUPS, STATUS_LABEL } = require('./format-catalog');

test('every format has a known group and status, and numbers are unique', () => {
  const groups = new Set(GROUPS.map((g) => g.id));
  const seen = new Set();
  for (const f of FORMATS) {
    assert.ok(groups.has(f.group), `${f.name} has a known group`);
    assert.ok(STATUS_LABEL[f.status], `${f.name} has a known status`);
    assert.ok(!seen.has(f.n), `${f.name} number is unique`);
    seen.add(f.n);
    assert.ok(f.name && f.line, `${f.name} has words`);
  }
});

test('only live formats open a tool, and every live format has one', () => {
  for (const f of FORMATS) {
    if (f.status === 'live') assert.ok(f.tool, `${f.name} is live so it needs a tool`);
    else assert.ok(!f.tool, `${f.name} is not live so it must not open a tool`);
  }
});

test('live post formats name a platform and a type the composer knows', () => {
  for (const f of FORMATS.filter((x) => x.tool && x.tool.kind === 'post')) {
    assert.ok(['update', 'poll', 'quiz', 'thread'].includes(f.tool.type), `${f.name} type`);
    assert.ok(['telegram', 'discord', 'bluesky', 'slack', 'tumblr'].includes(f.tool.platform), `${f.name} platform`);
  }
});
