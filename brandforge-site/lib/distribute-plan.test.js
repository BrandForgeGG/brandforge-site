const test = require('node:test');
const assert = require('node:assert/strict');
const { SLOT_SETS, layoutWeek, buildAnglesPrompt, normalizeAngles, buildDayPrompt, normalizeDay, assembleWeek, closingsFor, anglesFor, perDayOf, startOf, withClosing } = require('./distribute-plan');

const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

test('every posting-time set keeps posts at least 2.5 hours apart', () => {
  for (const [count, times] of Object.entries(SLOT_SETS)) {
    assert.equal(times.length, Number(count));
    for (let i = 1; i < times.length; i++) assert.ok(minutes(times[i]) - minutes(times[i - 1]) >= 150, `${count}: ${times.join()}`);
  }
});

test('a week is seven days, the right number of posts, in different formats with different asks', () => {
  for (const perDay of [1, 3, 5]) {
    const week = layoutWeek({ startDate: '2026-10-12', perDay });
    assert.equal(week.length, 7);
    assert.equal(week[0].name, 'Monday');
    assert.equal(week[6].date, '2026-10-18');
    const posts = week.flatMap((day) => day.posts);
    assert.equal(posts.length, 7 * perDay);
    for (let i = 1; i < posts.length; i++) {
      assert.notEqual(posts[i].format, posts[i - 1].format, 'neighbouring posts differ in format');
      assert.notEqual(posts[i].cta, posts[i - 1].cta, 'neighbouring posts differ in ask');
    }
    assert.ok(new Set(posts.map((post) => post.format)).size >= Math.min(6, posts.length), 'formats are mixed');
    if (perDay >= 3) assert.ok(new Set(posts.map((post) => post.cta)).size >= 6, 'many different asks');
  }
});

test('odd input falls back to a sensible week', () => {
  assert.equal(perDayOf('x'), 3);
  assert.equal(perDayOf(9), 3);
  assert.equal(perDayOf(2), 2);
  assert.match(startOf('nope'), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(startOf('2026-10-12'), '2026-10-12');
});

test('the angles reply is read defensively and padded so a week is never short', () => {
  const ok = normalizeAngles(JSON.stringify({ summary: 'A bakery that sells sourdough on Saturdays.', voice: 'warm', angles: ['Why sourdough takes two days', 'Why sourdough takes two days', 'How to store a loaf', 'What Saturday pickup looks like', 'The flour we choose and why'] }), 12);
  assert.equal(ok.ok, true);
  assert.equal(ok.angles.length, 12);
  assert.equal(new Set(ok.angles.map((a) => a.toLowerCase())).size, 12, 'no repeats even when padded');
  assert.equal(normalizeAngles('not json', 12).ok, false);
  assert.equal(normalizeAngles(JSON.stringify({ summary: 'A bakery that sells bread.', angles: ['one idea only'] }), 21).ok, false);
});

test('a day reply maps to its posts, appends the closing line, and marks gaps', () => {
  const expected = [{ closing: 'Save this for when you need it.' }, { closing: 'Start free at brandforge.gg' }];
  const day = normalizeDay(JSON.stringify({ posts: [{ topic: 'Why sourdough takes two days to rise', caption: 'Ever wondered why good bread takes time? The slow rise builds flavour.' }, { topic: 'x', caption: 'short' }] }), expected);
  assert.match(day[0].caption, /Save this for when you need it\.$/);
  assert.equal(day[1], null);
  assert.equal(withClosing('Ends already. Save this for when you need it.', 'Save this for when you need it.'), 'Ends already. Save this for when you need it.');
});

test('assembling a week fills every slot, even for a day the writer could not finish', () => {
  const week = layoutWeek({ startDate: '2026-10-12', perDay: 3 });
  const angles = Array.from({ length: 21 }, (_, i) => `Angle number ${i + 1} about sourdough`);
  const written = week.map((_, d) => (d === 2 ? null : week[d].posts.map((post, i) => ({ topic: `Topic ${d}-${i} for the picture`, caption: `Caption ${d}-${i} that is long enough to count. ${closingsFor({ week, dayIndex: d, site: 'brandforge.gg', brand: 'BrandForge' })[i]}` }))));
  const out = assembleWeek({ week, angles, written, site: 'brandforge.gg', brand: 'BrandForge' });
  assert.equal(out.flatMap((day) => day.posts).length, 21);
  assert.ok(out[2].posts.every((post) => post.fallback), 'the unfinished day has plain posts');
  assert.ok(!out[0].posts.some((post) => post.fallback));
  for (const post of out.flatMap((day) => day.posts)) assert.ok(post.caption.length > 20 && post.topic.length > 5);
  assert.equal(anglesFor({ week, dayIndex: 1, angles }).length, 3);
});

test('prompts carry the source, the closing line and the rule against invention', () => {
  const a = buildAnglesPrompt({ source: 'We sell sourdough.', count: 21, site: 'bakery.test' });
  assert.match(a.user, /We sell sourdough/);
  assert.match(a.system, /never invent/i);
  const d = buildDayPrompt({ summary: 'A bakery.', voice: 'warm', day: { name: 'Monday', focus: 'Start the week' }, posts: [{ format: 'quote', angle: 'Why slow bread is better', closing: 'Save this.' }] });
  assert.match(d.user, /Closing line: Save this\./);
  assert.match(d.system, /word for word/);
});
