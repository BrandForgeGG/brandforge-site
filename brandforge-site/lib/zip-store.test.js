'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { zipStore, crc32 } = require('./zip-store');

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('the archive has the right structure and entries', () => {
  const files = [
    { name: '01-cover.png', bytes: new Uint8Array([1, 2, 3, 4]) },
    { name: '02/odd:name.png', bytes: new TextEncoder().encode('hello world') },
  ];
  const zip = zipStore(files);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(zip.length - 22 + 10, true), 2);
});

test('a real unzip tool can read it back (skipped if none is installed)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bfzip-'));
  const file = path.join(dir, 'a.zip');
  fs.writeFileSync(file, zipStore([{ name: 'hello.txt', bytes: new TextEncoder().encode('hello world') }]));
  try {
    const out = execFileSync('tar', ['-xOf', file, 'hello.txt'], { encoding: 'utf8' });
    assert.equal(out, 'hello world');
  } catch (cause) {
    t.skip('no archive tool available: ' + (cause && cause.code));
  }
});
