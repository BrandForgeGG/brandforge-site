const test = require('node:test');
const assert = require('node:assert');

const { parseInlines, parseMarkdown } = require('./markdown.js');

test('parseMarkdown returns no tokens for empty input', () => {
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(parseMarkdown(null), []);
});

test('headings keep their depth and inline content', () => {
  const tokens = parseMarkdown('# Title\n\n## Section\n\nbody');
  assert.equal(tokens[0].type, 'heading');
  assert.equal(tokens[0].depth, 1);
  assert.equal(tokens[1].depth, 2);
  assert.equal(tokens[2].type, 'paragraph');
});

test('paragraphs split on blank lines and soft-join wrapped lines', () => {
  const tokens = parseMarkdown('first line\ncontinued line\n\nsecond paragraph');
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].type, 'paragraph');
  assert.equal(tokens[0].inlines[0].text, 'first line continued line');
  assert.equal(tokens[1].inlines[0].text, 'second paragraph');
});

test('unordered and ordered lists parse with their items', () => {
  const tokens = parseMarkdown('- one\n- two\n\n1. first\n2. second');
  assert.equal(tokens[0].type, 'list');
  assert.equal(tokens[0].ordered, false);
  assert.equal(tokens[0].items.length, 2);
  assert.equal(tokens[1].ordered, true);
  assert.equal(tokens[1].items.length, 2);
});

test('list items support inline formatting', () => {
  const tokens = parseMarkdown('- **bold** and `code`');
  const texts = tokens[0].items[0];
  assert.ok(texts.some((inline) => inline.type === 'strong' && inline.text === 'bold'));
  assert.ok(texts.some((inline) => inline.type === 'code' && inline.text === 'code'));
});

test('fenced code keeps content verbatim including HTML', () => {
  const tokens = parseMarkdown('```js\nconst a = "<script>alert(1)</script>";\n```');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].type, 'code');
  assert.equal(tokens[0].lang, 'js');
  assert.match(tokens[0].code, /<script>/);
});

test('an unterminated fence runs to the end of the input', () => {
  const tokens = parseMarkdown('```\nunclosed');
  assert.equal(tokens[0].type, 'code');
  assert.equal(tokens[0].code, 'unclosed');
});

test('raw HTML is plain text, never a token type that could execute', () => {
  const tokens = parseMarkdown('<img src=x onerror=alert(1)> hello');
  assert.equal(tokens[0].type, 'paragraph');
  assert.equal(tokens[0].inlines[0].type, 'text');
  assert.match(tokens[0].inlines[0].text, /<img src=x onerror=alert\(1\)>/);
});

test('links only work for safe schemes', () => {
  const safe = parseInlines('[docs](https://brandforge.gg/docs)');
  assert.deepEqual(safe[0], { type: 'link', text: 'docs', href: 'https://brandforge.gg/docs' });

  const relative = parseInlines('[chat](/chat)');
  assert.equal(relative[0].type, 'link');

  const unsafe = parseInlines('[run](javascript:alert(1))');
  assert.equal(unsafe[0].type, 'text');
  assert.match(unsafe[0].text, /javascript:alert\(1\)/);
});

test('bold, italic and inline code are recognized', () => {
  const inlines = parseInlines('a **b** c *d* e `f` g _h_');
  const types = inlines.map((inline) => inline.type);
  assert.ok(types.includes('strong'));
  assert.ok(types.includes('em'));
  assert.ok(types.includes('code'));
});

test('blockquote and horizontal rule parse', () => {
  const tokens = parseMarkdown('> quoted line\n\n---');
  assert.equal(tokens[0].type, 'quote');
  assert.equal(tokens[0].inlines[0].text, 'quoted line');
  assert.equal(tokens[1].type, 'hr');
});
