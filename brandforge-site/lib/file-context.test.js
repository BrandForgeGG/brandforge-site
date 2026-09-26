const test = require('node:test');
const assert = require('node:assert');

const {
  MAX_FILE_CHARS,
  buildFileContextBlock,
  formatBytes,
  isDirectlyReadable,
} = require('./file-context.js');

test('readable text formats are recognized, binaries are not', () => {
  assert.equal(isDirectlyReadable('text/plain'), true);
  assert.equal(isDirectlyReadable('text/csv'), true);
  assert.equal(isDirectlyReadable('application/json'), true);
  assert.equal(isDirectlyReadable('application/pdf'), false);
  assert.equal(isDirectlyReadable('image/png'), false);
  assert.equal(isDirectlyReadable('audio/mpeg'), false);
  assert.equal(isDirectlyReadable(null), false);
});

test('formatBytes is human readable', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(2.4 * 1024 * 1024), '2.4 MB');
  assert.equal(formatBytes('nope'), 'unknown size');
});

test('no files means no block at all', () => {
  assert.equal(buildFileContextBlock([]), '');
  assert.equal(buildFileContextBlock(null), '');
});

test('binary files are listed but their content is never claimed', () => {
  const block = buildFileContextBlock([
    { name: 'Scope_of_Work.pdf', contentType: 'application/pdf', size: 2.4 * 1024 * 1024 },
  ]);

  assert.match(block, /PROJECT FILES IN THIS CONVERSATION/);
  assert.match(block, /Scope_of_Work\.pdf \(application\/pdf, 2\.4 MB\)/);
  assert.match(block, /listed only; contents not loaded \(binary format\)/);
  assert.doesNotMatch(block, /full content included below/);
});

test('readable files have their text embedded', () => {
  const block = buildFileContextBlock([
    { name: 'notes.txt', contentType: 'text/plain', size: 12, text: 'hello world' },
  ]);

  assert.match(block, /full content included below/);
  assert.match(block, /hello world/);
});

test('a readable file whose content failed to load is reported honestly', () => {
  const block = buildFileContextBlock([
    { name: 'data.csv', contentType: 'text/csv', size: 10, text: null },
  ]);

  assert.match(block, /content not loaded this turn/);
  assert.doesNotMatch(block, /hello/);
});

test('oversized content is clipped to the per-file budget with a note', () => {
  const big = 'x'.repeat(MAX_FILE_CHARS + 5000);
  const block = buildFileContextBlock([
    { name: 'big.txt', contentType: 'text/plain', size: big.length, text: big },
  ]);

  assert.match(block, /truncated to the first 20000 characters/);
  const embedded = block.split('\n').filter((line) => line.startsWith('x')).join('');
  assert.ok(embedded.length <= MAX_FILE_CHARS + 100, 'content must respect the file budget');
});

test('file names are sanitized in length', () => {
  const block = buildFileContextBlock([
    { name: 'a'.repeat(400) + '.txt', contentType: 'text/plain', size: 3, text: 'hi' },
  ]);

  const header = block.split('\n')[1];
  assert.ok(header.length < 200, 'file name must be clipped');
});
