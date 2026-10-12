const test = require('node:test');
const assert = require('node:assert/strict');
const { composeCaption } = require('./calendar-caption');
const { KINDS } = require('./caption-cta');

const plan = { cover: { headline: 'FIVE *MISTAKES* WITH YOUR LANDING PAGE' }, items: [{ n: 1, name: 'No clear promise' }, { n: 2, name: 'Too many buttons' }, { n: 3, name: 'Slow load' }, { n: 4, name: 'No proof' }] };
const image = (copy) => ({ copy: { options: [], ...copy } });

test('every format builds a caption from the post itself and ends with the ask', () => {
  const cases = [
    { format: 'carousel', kind: 'save', plan, expect: /landing page/i },
    { format: 'quote', kind: 'share', image: image({ headline: 'Done beats perfect' }), expect: /Done beats perfect/ },
    { format: 'tip', kind: 'follow', image: image({ headline: 'Write the hook first', sub: 'The first line decides who reads the rest.' }), expect: /hook first/ },
    { format: 'ad', kind: 'try', image: image({ headline: 'Your idea, made today', sub: 'Say it once.' }), expect: /Your idea/ },
    { format: 'announcement', kind: 'hire', image: image({ headline: 'Trade is open', sub: 'List anything.' }), expect: /Trade is open/ },
    { format: 'question', kind: 'comment', image: image({ headline: 'Morning or evening?', options: ['Morning', 'Evening'] }), expect: /A\) Morning\nB\) Evening/ },
  ];
  for (const c of cases) {
    const caption = composeCaption({ ...c, seed: 'x' });
    assert.match(caption, c.expect, c.format);
    assert.ok(!/\*/.test(caption), 'no stray asterisks');
    assert.ok(caption.length < 700);
  }
});

test('the ask changes the closing line: try and hire carry the site, hire goes to the plans', () => {
  assert.match(composeCaption({ format: 'ad', kind: 'try', seed: 'a', image: image({ headline: 'H headline', sub: 'sub line' }) }), /brandforge\.gg/);
  assert.match(composeCaption({ format: 'ad', kind: 'hire', seed: 'a', image: image({ headline: 'H headline', sub: 'sub line' }) }), /brandforge\.gg\/pricing/);
  assert.doesNotMatch(composeCaption({ format: 'quote', kind: 'save', seed: 'a', image: image({ headline: 'H headline' }) }), /pricing/);
});

test('across many posts the captions differ in shape and in ask', () => {
  const shapes = new Set();
  const closings = new Set();
  for (let i = 0; i < 40; i++) {
    const kind = KINDS[i % KINDS.length];
    const caption = composeCaption({ format: 'carousel', kind, seed: `seed-${i}`, plan });
    shapes.add(caption.split('\n\n')[1].slice(0, 6));
    closings.add(caption.split('\n\n').pop());
  }
  assert.ok(shapes.size >= 3, 'several opening shapes: ' + shapes.size);
  assert.ok(closings.size >= 12, 'many different closing lines: ' + closings.size);
});
