const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { sanitizeImage, FORMAT_IDS, KIND_IDS } = require('./image-kinds');
const { drawImagePost, sizeOf } = require('./image-render');

const copy = { kicker: 'New', headline: 'Stop posting *without* a hook every single day', sub: 'The first line decides if anyone reads the rest of the post you worked on.', button: 'Try it free', options: ['Tea', 'Coffee', 'Water'] };

test('every kind draws in every size without throwing, and the picture is not blank', () => {
  for (const kind of KIND_IDS) {
    for (const format of FORMAT_IDS) {
      const spec = sanitizeImage({ kind, format, copy });
      assert.ok(spec, `${kind} ${format}`);
      const { w, h } = sizeOf(format);
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      drawImagePost(ctx, spec, { theme: 'forge', brand: { name: 'BrandForge', handle: 'brandforge.gg' } }, null);
      const data = ctx.getImageData(0, 0, w, h).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 4 * 97) if (data[i] > 40 || data[i + 1] > 40 || data[i + 2] > 40) lit += 1;
      assert.ok(lit > 20, `${kind} ${format} drew nothing`);
    }
  }
});
