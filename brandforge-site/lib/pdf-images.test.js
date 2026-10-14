'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { imagesToPdf } = require('./pdf-images.js');

// A tiny stand-in for JPEG bytes: the PDF only stores them, it never decodes them.
const fake = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

test('one page per picture, with a valid header, trailer and cross-reference', () => {
  const pdf = imagesToPdf([{ jpeg: fake, width: 1080, height: 1350 }, { jpeg: fake, width: 1080, height: 1350 }]);
  const text = Buffer.from(pdf).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count 2/);
  assert.equal((text.match(/\/Subtype \/Image/g) || []).length, 2);
  // Every offset in the cross-reference points at the object it names.
  const xrefAt = Number(text.match(/startxref\n(\d+)/)[1]);
  const rows = text.slice(xrefAt).split('\n').slice(3).filter((row) => / n $/.test(row));
  rows.forEach((row, i) => assert.ok(text.slice(Number(row.slice(0, 10))).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
});

test('the page keeps the picture shape, long side 792 points', () => {
  const text = Buffer.from(imagesToPdf([{ jpeg: fake, width: 1080, height: 1350 }])).toString('latin1');
  assert.match(text, /\/MediaBox \[0 0 633\.6 792\]/);
});

test('no pages is an error, not an empty file', () => {
  assert.throws(() => imagesToPdf([]));
});
